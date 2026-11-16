import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, AtSign, Lock, Mail, Mountain, User } from 'lucide-react';
import { Button, Card } from '../components/ui/DesignSystem';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

const registerSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Họ và tên cần ít nhất 2 ký tự')
    .max(80, 'Họ và tên tối đa 80 ký tự'),
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,30}$/,
      'Username chỉ gồm chữ cái, số và dấu gạch dưới (3-30 ký tự)',
    )
    .optional()
    .or(z.literal('')),
  email: z.string().email('Email không hợp lệ'),
  password: z
    .string()
    .min(8, 'Mật khẩu phải từ 8 ký tự trở lên')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      'Cần ít nhất 1 chữ hoa, 1 chữ thường và 1 chữ số',
    ),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState<boolean>(true);

  useEffect(() => {
    authService
      .getGoogleOAuthStatus()
      .then((res) => setGoogleConfigured(Boolean(res.configured)))
      .catch(() => setGoogleConfigured(false));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const payload = {
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        ...(values.username ? { username: values.username } : {}),
      };
      const res = await authService.register(payload);
      setAuth(res.user, res.accessToken, res.csrfToken || null);
      navigate('/feed');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Đăng ký không thành công. Vui lòng kiểm tra lại thông tin.';
      setServerError(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  return (
    <div className="max-w-md mx-auto py-6">
      <Card className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
            <Mountain className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-stone-900">
            Tạo tài khoản TravelShare
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Tham gia cộng đồng yêu thích trekking, camping và du lịch ngoài trời
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
              Họ và tên
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Nguyễn Quang Minh"
                {...register('fullName')}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            {errors.fullName && (
              <p className="text-xs text-red-600 mt-1">
                {errors.fullName.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Username (Tùy chọn)
            </label>
            <div className="relative">
              <AtSign className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="minh_trekking"
                {...register('username')}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            {errors.username && (
              <p className="text-xs text-red-600 mt-1">
                {errors.username.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="email"
                placeholder="minh@travelshare.vn"
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
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="password"
                placeholder="Ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số"
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
            Đăng ký tài khoản
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
              onClick={() => {
                window.location.href = authService.getGoogleLoginUrl('/feed');
              }}
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
              Đăng ký nhanh với Google
            </button>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-stone-100 text-center text-xs text-stone-600">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="font-semibold text-emerald-700 hover:underline"
          >
            Đăng nhập ngay
          </Link>
        </div>
      </Card>
    </div>
  );
};
