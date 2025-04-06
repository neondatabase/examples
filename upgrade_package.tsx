import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// Walk through each directory and upgrade @neondatabase/serverless
function upgradeNeonInDirectories() {
  try {
    const directories = readdirSync(".", { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const dir of directories) {
      const packageJsonPath = join(dir, "package.json");

      if (existsSync(packageJsonPath)) {
        console.log(`\nProcessing ${dir}...`);

        try {
          // Run npm install first
          console.log("Running npm install...");
          execSync("npm install", {
            cwd: dir,
            stdio: "inherit",
          });

          // Then upgrade @neondatabase/serverless
          console.log("Upgrading @neondatabase/serverless...");
          execSync("npm i @neondatabase/serverless@latest", {
            cwd: dir,
            stdio: "inherit",
          });

          console.log(`✅ Successfully processed ${dir}`);
        } catch (err) {
          console.error(`❌ Error processing ${dir}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("Failed to process directories:", err.message);
  }
}

upgradeNeonInDirectories();
