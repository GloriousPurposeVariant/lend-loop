import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { TOOL_IMAGE_LIMITS, toolImageProblem } from "@lendloop/core/convex/lib/toolFields";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";

/** Why these files cannot be added to a tool that already has `existingCount` photos, or null. */
export function checkToolPhotos(files: File[], existingCount: number): string | null {
  if (existingCount + files.length > TOOL_IMAGE_LIMITS.maxPerTool) {
    return `A tool can have at most ${TOOL_IMAGE_LIMITS.maxPerTool} photos.`;
  }
  for (const file of files) {
    const problem = toolImageProblem({ contentType: file.type, size: file.size });
    if (problem !== null) {
      return `${file.name}: ${problem}`;
    }
  }
  return null;
}

/**
 * Uploads photos to Convex storage and attaches them to a tool, one at a time.
 * Every file is checked before the first upload, so a bad file uploads nothing.
 */
export function useUploadToolPhotos() {
  const generateUploadUrl = useMutation(api.toolImages.generateUploadUrl);
  const addImage = useMutation(api.toolImages.add);

  return async function uploadToolPhotos(
    toolId: Id<"tools">,
    files: File[],
    existingCount: number,
  ) {
    // Same shape as our Convex errors, so getErrorMessage shows the message.
    const problem = checkToolPhotos(files, existingCount);
    if (problem !== null) {
      throw new ConvexError({ code: "INVALID_INPUT", message: problem });
    }
    for (const file of files) {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Upload failed. Please try again.",
        });
      }
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await addImage({ toolId, storageId });
    }
  };
}
