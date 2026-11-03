"use client";

import type { api } from "@lendloop/core/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

export type ToolImage = FunctionReturnType<typeof api.tools.listMine>[number]["images"][number];

// Plain <img>, not next/image: the photos come from Convex, whose address changes per
// deployment, and next/image would need every one listed in next.config.ts.

/** One large photo with thumbnails to switch between them. */
export function ToolPhotoGallery({ name, images }: { name: string; images: ToolImage[] }) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-lg bg-gray-100 text-sm text-gray-400">
        No photos yet
      </div>
    );
  }
  // A photo can be removed while it is shown, so never point past the end.
  const current = images[Math.min(selected, images.length - 1)];

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- see the note above */}
      <img
        src={current.url}
        alt={`Photo of ${name}`}
        className="aspect-[4/3] w-full rounded-lg bg-gray-100 object-cover"
      />
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button
              key={image._id}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-pressed={image._id === current._id}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ${
                image._id === current._id ? "border-emerald-600" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- see the note above */}
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
