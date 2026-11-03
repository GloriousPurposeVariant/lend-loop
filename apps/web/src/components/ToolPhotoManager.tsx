"use client";

import { api } from "@lendloop/core/convex/_generated/api";
import type { Id } from "@lendloop/core/convex/_generated/dataModel";
import { TOOL_IMAGE_LIMITS } from "@lendloop/core/convex/lib/toolFields";
import { useMutation } from "convex/react";
import { useState, type ChangeEvent } from "react";
import type { ToolImage } from "@/components/ToolPhotoGallery";
import { buttonStyles, ErrorText } from "@/components/ui";
import { useUploadToolPhotos } from "@/hooks/useUploadToolPhotos";
import { getErrorMessage } from "@/lib/errors";

type Props = {
  toolId: Id<"tools">;
  name: string;
  images: ToolImage[];
};

/** Thumbnails of a tool's photos, with add and remove, for its owner. */
export function ToolPhotoManager({ toolId, name, images }: Props) {
  const uploadToolPhotos = useUploadToolPhotos();
  const removeImage = useMutation(api.toolImages.remove);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Clear the input, so picking the same file again after an error still fires onChange.
    event.target.value = "";
    if (files.length === 0) {
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      await uploadToolPhotos(toolId, files, images.length);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove(imageId: Id<"toolImages">) {
    if (!window.confirm(`Remove this photo of "${name}"?`)) {
      return;
    }
    setError(null);
    try {
      await removeImage({ imageId });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {images.map((image, i) => (
          <div key={image._id} className="relative h-16 w-16">
            {/* eslint-disable-next-line @next/next/no-img-element -- see ToolPhotoGallery */}
            <img
              src={image.url}
              alt={`Photo ${i + 1} of ${name}`}
              className="h-full w-full rounded-md object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(image._id)}
              aria-label={`Remove photo ${i + 1} of ${name}`}
              className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full border border-gray-200 bg-white text-xs text-gray-600 shadow-sm hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        {images.length < TOOL_IMAGE_LIMITS.maxPerTool && (
          // The real file input is visually hidden; the label is what people click.
          <label
            className={`${buttonStyles.secondary} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500`}
          >
            {isUploading ? "Uploading…" : "Add photos"}
            <input
              type="file"
              accept={TOOL_IMAGE_LIMITS.contentTypes.join(",")}
              multiple
              disabled={isUploading}
              onChange={handleFiles}
              className="sr-only"
            />
          </label>
        )}
        <span className="text-xs text-gray-500">
          {images.length}/{TOOL_IMAGE_LIMITS.maxPerTool} photos
        </span>
      </div>
      <ErrorText message={error} />
    </div>
  );
}
