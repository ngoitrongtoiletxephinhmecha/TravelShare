import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Lock, Mail, Mountain } from 'lucide-react';
import { Button, Card } from '../components/ui/DesignSystem';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const OAUTH_ERROR_LABELS: Record<string, string> = {
  not_configured: 'Google OAuth chưa được cấu hình trên máy chủ.',
  access_denied: 'Bạn đã hủy đăng nhập bằng Google.',
  invalid_state:
    'Phiên xác thực Google không khớp hoặc đã hết hạn. Vui lòng thử lại.',
  account_locked:
    'Tài khoản của bạn hiện đang bị khóa hoặc ngừng hoạt động.',
  oauth_failed: 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.',
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean>(true);

  useEffect(() => {
    const oauthErr = searchParams.get('oauthError');
    const customMsg = searchParams.get('message');
    const sessionErr = searchParams.get('sessionError');
    if (oauthErr) {
      setServerError(
        customMsg ||
          OAUTH_ERROR_LABELS[oauthErr] ||
          'Đăng nhập bằng Google thất bại.',
      );
    } else if (sessionErr) {
      setServerError(sessionErr);
    }

    authService
      .getGoogleOAuthStatus()
      .then((res) => setGoogleConfigured(Boolean(res.configured)))
      .catch(() => setGoogleConfigured(false));
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const res = await authService.login(values);
      setAuth(res.user, res.accessToken, res.csrfToken || null);
      navigate('/feed');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể đăng nhập. Vui lòng kiểm tra kết nối Backend hoặc thông tin tài khoản.';
      setServerError(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  const handleGoogleLogin = () => {
    setServerError(null);
    const redirect = searchParams.get('redirect') || '/feed';
    window.location.href = authService.getGoogleLoginUrl(redirect);
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <Card className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Mountain className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-stone-900">
            Đăng nhập TravelShare
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Kết nối cộng đồng du lịch, chia sẻ thiết bị và lập kế hoạch cùng AI
          </p>
        </div>

        {serverError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="email"
                placeholder="ban@travelshare.vn"
                {...register('email')}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            {errors.email && (
              <p className="text-xs text-red-600 mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-stone-700">
                Mật khẩu
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            {errors.password && (
              <p className="text-xs text-red-600 mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
          >
            Đăng nhập
          </Button>
        </form>

        {googleConfigured && (
          <div className="mt-4">
            <div className="relative my-4 flex items-center">
              <div className="flex-grow border-t border-stone-200" />
              <span className="mx-3 text-[11px] font-medium text-stone-400 uppercase">
                Hoặc
              </span>
              <div className="flex-grow border-t border-stone-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-sm font-semibold text-stone-800 transition-colors shadow-xs"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
                />
                <path
                  fill="#34A853"
                  d="M3.4 7.3l3.2 2.3C7.5 7.4 9.6 5.9 12 5.9c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 8.2 2.3 4.9 4.4 3.4 7.3z"
                />
                <path
                  fill="#FBBC05"
                  d="M12 21.7c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5C4.8 19.4 8.1 21.7 12 21.7z"
                />
                <path
                  fill="#4285F4"
                  d="M21.3 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.4-1.1 2.4-2.1 3.1l3 2.5c1.8-1.6 2.9-4.1 2.9-7.9z"
                />
              </svg>
              Tiếp tục với Google
            </button>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-stone-100 text-center text-xs text-stone-600">
          Chưa có tài khoản TravelShare?{' '}
          <Link
            to="/register"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Đăng ký tài khoản mới
          </Link>
        </div>
      </Card>
    </div>
  );
};
