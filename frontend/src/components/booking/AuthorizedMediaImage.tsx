import React, { useEffect, useState } from 'react';
import { apiBaseURL, apiClient, apiOrigin } from '../../services/api';

function resolveAssetFetchPath(src: string): { isProtected: boolean; fetchUrl: string } {
  const trimmed = String(src || '').trim();
  if (/\/media\/assets\/[a-f0-9]{24}/i.test(trimmed)) {
    if (trimmed.startsWith('/api/v1/')) {
      return {
        isProtected: true,
        fetchUrl: trimmed.replace(/^\/api\/v1/, ''),
      };
    }
    if (trimmed.startsWith(apiBaseURL)) {
      return {
        isProtected: true,
        fetchUrl: trimmed.slice(apiBaseURL.length) || '/',
      };
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return { isProtected: true, fetchUrl: trimmed };
    }
    return { isProtected: true, fetchUrl: trimmed };
  }

  if (trimmed.startsWith('/uploads/')) {
    return { isProtected: false, fetchUrl: `${apiOrigin}${trimmed}` };
  }

  return { isProtected: false, fetchUrl: trimmed };
}

export const AuthorizedMediaImage: React.FC<{
  src: string;
  alt: string;
  className?: string;
}> = ({ src, alt, className }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;
    setFailed(false);

    const { isProtected, fetchUrl } = resolveAssetFetchPath(src);
    if (!isProtected) {
      setResolvedSrc(fetchUrl);
      return;
    }

    apiClient
      .get(fetchUrl, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        createdObjectUrl = URL.createObjectURL(res.data);
        setResolvedSrc(createdObjectUrl);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      });

    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-stone-100 text-[11px] text-stone-500 border border-stone-200 rounded-xl ${className || ''}`}
      >
        Không thể tải ảnh bảo mật
      </div>
    );
  }

  if (!resolvedSrc) {
    return (
      <div
        className={`animate-pulse bg-stone-100 border border-stone-200 rounded-xl ${className || ''}`}
      />
    );
  }

  return <img src={resolvedSrc} alt={alt} className={className} />;
};
