import { neon } from "@neon/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = "gpt-5-mini";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const analysisSchema = z.object({
	description: z
		.string()
		.describe("A detailed description of the image, in two to four sentences."),
	subjects: z
		.array(z.string())
		.max(20)
		.describe("The main people, objects, or animals visible in the image."),
	setting: z
		.string()
		.describe("Where the scene takes place, or 'unclear' when it cannot be determined."),
	text: z
		.array(z.string())
		.max(50)
		.describe("Visible text, transcribed exactly. Empty when there is none."),
	tags: z
		.array(z.string())
		.max(15)
		.describe("Short lowercase tags that describe the image."),
});

export default {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response(null, { status: 405, headers: { Allow: "POST" } });
		}

		const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
		if (!contentType.startsWith("multipart/form-data")) {
			return Response.json(
				{ error: "Send multipart/form-data with an image file" },
				{ status: 415 },
			);
		}

		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return Response.json({ error: "Could not read the form data" }, { status: 400 });
		}

		const file = form.get("image");
		if (!(file instanceof File)) {
			return Response.json(
				{ error: "Provide an image file in the 'image' form field" },
				{ status: 400 },
			);
		}
		if (file.size === 0) {
			return Response.json({ error: "The uploaded image is empty" }, { status: 400 });
		}
		if (file.size > MAX_IMAGE_BYTES) {
			return Response.json(
				{ error: `The image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB` },
				{ status: 413 },
			);
		}
		if (!file.type.startsWith("image/")) {
			return Response.json({ error: "The uploaded file is not an image" }, { status: 415 });
		}

		try {
			const { output } = await generateText({
				model: neon(MODEL),
				instructions:
					"You analyze images. Be factual and concise. Only describe what is visible, and say when something is unclear instead of guessing.",
				output: Output.object({ schema: analysisSchema }),
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Here's the image. Describe it and return the requested structured details." },
							{
								type: "file",
								mediaType: file.type,
								data: new Uint8Array(await file.arrayBuffer()),
							},
						],
					},
				],
			});

			return Response.json({
				description: output.description,
				details: {
					subjects: output.subjects,
					setting: output.setting,
					text: output.text,
					tags: output.tags,
				},
				model: MODEL,
			});
		} catch (error) {
			console.error("[image-analysis] failed:", error);
			return Response.json({ error: "Image analysis failed" }, { status: 502 });
		}
	},
};
