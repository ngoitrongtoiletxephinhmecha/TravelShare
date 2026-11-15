import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { cn } from '../../utils/format';

interface MediaGalleryProps {
  mediaUrls: string[];
  altPrefix?: string;
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(url);
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  mediaUrls,
  altPrefix = 'Media bài viết TravelShare',
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!mediaUrls || mediaUrls.length === 0) return null;

  const displayItems = mediaUrls.slice(0, 4);
  const extraCount = mediaUrls.length - 4;

  return (
    <>
      <div
        className={cn(
          'grid gap-1.5 bg-stone-100 overflow-hidden',
          mediaUrls.length === 1 && 'grid-cols-1',
          mediaUrls.length === 2 && 'grid-cols-2',
          mediaUrls.length >= 3 && 'grid-cols-2',
        )}
      >
        {displayItems.map((url, idx) => {
          const isVideo = isVideoUrl(url);
          const spanFull = mediaUrls.length === 3 && idx === 0;

          return (
            <div
              key={`${url}-${idx}`}
              onClick={() => setLightboxIndex(idx)}
              className={cn(
                'relative cursor-pointer group overflow-hidden bg-stone-900/5',
                mediaUrls.length === 1 ? 'aspect-[16/10]' : 'aspect-[4/3]',
                spanFull && 'col-span-2 aspect-[16/9]',
              )}
            >
              {isVideo ? (
                <div className="w-full h-full relative bg-stone-900 flex items-center justify-center">
                  <video
                    src={url}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                  />
                  <div className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center absolute">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>
              ) : (
                <img
                  src={url}
                  alt={`${altPrefix} ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
              )}

              {idx === 3 && extraCount > 0 && (
                <div className="absolute inset-0 bg-stone-950/60 text-white flex items-center justify-center text-xl font-bold">
                  +{extraCount}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox Viewer */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Đóng xem ảnh"
          >
            <X className="w-6 h-6" />
          </button>

          {mediaUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(
                    (lightboxIndex - 1 + mediaUrls.length) % mediaUrls.length,
                  );
                }}
                className="absolute left-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((lightboxIndex + 1) % mediaUrls.length);
                }}
                className="absolute right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div
            className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideoUrl(mediaUrls[lightboxIndex]) ? (
              <video
                src={mediaUrls[lightboxIndex]}
                controls
                autoPlay
                className="max-h-[80vh] w-auto rounded-xl"
              />
            ) : (
              <img
                src={mediaUrls[lightboxIndex]}
                alt={`${altPrefix} phóng to`}
                className="max-h-[80vh] w-auto object-contain rounded-xl"
              />
            )}
            <p className="text-xs text-stone-300 mt-3">
              Media {lightboxIndex + 1} / {mediaUrls.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
