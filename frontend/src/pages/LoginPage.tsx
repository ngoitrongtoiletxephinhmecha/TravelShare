import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

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
      setAuth(res.user, res.accessToken, res.refreshToken);
      navigate('/feed');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Không thể đăng nhập. Vui lòng kiểm tra kết nối Backend hoặc thông tin tài khoản.';
      setServerError(Array.isArray(msg) ? msg.join(', ') : msg);
    }
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
