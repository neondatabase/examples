#!/usr/bin/env node
// Builds <id>/template.tar.gz for every template in registry.json. The archive holds the modules
// that template.json references, at the same relative paths, so the CLI installs a template with
// one download. Output is deterministic: entries are sorted, and owner, mode, and mtime are fixed.
//
//   node registry/scripts/pack.mjs           # write the archives
//   node registry/scripts/pack.mjs --check   # exit 1 if any archive is missing or stale

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

const REGISTRY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_NAME = "template.tar.gz";
const BLOCK = 512;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// Same default as the CLI: a template without operations ships functions/index.ts.
const sourcePaths = (template) =>
	template.operations?.map((operation) => operation.source) ?? ["functions/index.ts"];

const isContained = (path) =>
	typeof path === "string" &&
	path !== "" &&
	!path.startsWith("/") &&
	!path.includes("\\") &&
	!path.split("/").some((segment) => segment === "" || segment === "." || segment === "..");

const octal = (value, length) => value.toString(8).padStart(length - 1, "0") + "\0";

const tarHeader = (name, size) => {
	if (Buffer.byteLength(name) > 100) throw new Error(`Path too long for a tar header: ${name}`);
	const header = Buffer.alloc(BLOCK);
	header.write(name, 0, 100, "utf8");
	header.write(octal(0o644, 8), 100);
	header.write(octal(0, 8), 108);
	header.write(octal(0, 8), 116);
	header.write(octal(size, 12), 124);
	header.write(octal(0, 12), 136);
	header.fill(" ", 148, 156);
	header.write("0", 156);
	header.write("ustar\0", 257);
	header.write("00", 263);
	let checksum = 0;
	for (const byte of header) checksum += byte;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
	return header;
};

const buildTar = (files) => {
	const chunks = [];
	for (const { name, data } of files) {
		chunks.push(tarHeader(name, data.length), data);
		const padding = (BLOCK - (data.length % BLOCK)) % BLOCK;
		if (padding) chunks.push(Buffer.alloc(padding));
	}
	chunks.push(Buffer.alloc(BLOCK * 2));
	return Buffer.concat(chunks);
};

const gzip = (tar) => {
	const gz = gzipSync(tar, { level: 9 });
	gz.writeUInt32LE(0, 4);
	gz[9] = 0xff;
	return gz;
};

const templateFiles = (entry) => {
	if (!isContained(entry.path)) throw new Error(`Template "${entry.id}" has an unsafe path: ${entry.path}`);
	const templatePath = join(REGISTRY_DIR, entry.path);
	const templateDir = dirname(templatePath);
	const template = readJson(templatePath);
	const names = [...new Set(sourcePaths(template))].sort();
	return {
		archivePath: join(templateDir, ARCHIVE_NAME),
		files: names.map((name) => {
			if (!isContained(name)) throw new Error(`Template "${entry.id}" references an unsafe path: ${name}`);
			const path = join(templateDir, name);
			if (!path.startsWith(templateDir + sep)) throw new Error(`${name} resolves outside ${templateDir}`);
			return { name: posix.normalize(name), data: readFileSync(path) };
		}),
	};
};

const check = process.argv.includes("--check");
const { templates } = readJson(join(REGISTRY_DIR, "registry.json"));
let stale = 0;

for (const entry of templates) {
	const { archivePath, files } = templateFiles(entry);
	const tar = buildTar(files);
	const shown = relative(process.cwd(), archivePath);
	if (check) {
		const current = existsSync(archivePath) ? gunzipSync(readFileSync(archivePath)) : null;
		if (!current?.equals(tar)) {
			console.error(`${shown} is missing or stale. Run node registry/scripts/pack.mjs.`);
			stale++;
		}
		continue;
	}
	writeFileSync(archivePath, gzip(tar));
	console.log(`${shown} (${files.map((file) => file.name).join(", ")})`);
}

if (stale) process.exit(1);
