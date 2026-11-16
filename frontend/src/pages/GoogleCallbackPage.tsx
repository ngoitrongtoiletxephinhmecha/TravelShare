import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Mountain } from 'lucide-react';
import { Card } from '../components/ui/DesignSystem';
import { authService } from '../services/auth.service';

export const GoogleCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const rawRedirect = searchParams.get('redirect') || '/feed';
    const safeRedirect =
      rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
        ? rawRedirect
        : '/feed';

    let active = true;
    authService
      .refreshSession()
      .then(() => {
        if (!active) return;
        navigate(safeRedirect, { replace: true });
      })
      .catch((err: any) => {
        if (!active) return;
        const msg =
          err?.response?.data?.message ||
          'Không thể hoàn tất phiên đăng nhập Google từ cookie HttpOnly.';
        setErrorMsg(Array.isArray(msg) ? msg.join(', ') : msg);
      });

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  return (
    <div className="max-w-md mx-auto py-12">
      <Card className="p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto">
          <Mountain className="w-6 h-6" />
        </div>
        {errorMsg ? (
          <>
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <Link
              to="/login"
              className="inline-block text-xs font-semibold text-emerald-700 hover:underline"
            >
              Quay lại trang đăng nhập
            </Link>
          </>
        ) : (
          <div className="space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-700 mx-auto" />
            <p className="text-sm font-semibold text-stone-900">
              Đang đồng bộ phiên đăng nhập Google...
            </p>
            <p className="text-xs text-stone-500">
              Vui lòng chờ trong giây lát.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
