import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarCheck,
  Compass,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Mountain,
  Search,
  ShieldCheck,
  Sparkles,
  Tent,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../services/auth.service';
import { refreshSessionSingleFlight } from '../services/api';
import { notificationService } from '../services/notification.service';
import { chatService } from '../services/chat.service';
import { socketService } from '../services/socket.service';
import { Button } from '../components/ui/DesignSystem';
import { cn } from '../utils/format';

const NAV_ITEMS = [
  { to: '/feed', label: 'Bảng tin', icon: Home },
  { to: '/explore', label: 'Khám phá', icon: Compass },
  { to: '/gear', label: 'Thuê & Mượn đồ', icon: Tent },
  { to: '/bookings/sent', label: 'Giao dịch thuê', icon: CalendarCheck },
  { to: '/my-gear', label: 'Kho đồ của tôi', icon: Mountain },
  { to: '/ai-assistant', label: 'Trợ lý AI', icon: Sparkles },
  { to: '/communities', label: 'Cộng đồng', icon: Users },
];

export const MainLayout: React.FC = () => {
  const { user, accessToken, isAuthenticated, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isAuthenticated && !accessToken) {
      refreshSessionSingleFlight().catch(() => {
        // clearAuth already handled by refreshSessionSingleFlight
      });
    }
  }, [isAuthenticated, accessToken]);

  const { data: unreadNotifData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationService.getUnreadCount(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => chatService.listConversations(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const unreadNotifCount = unreadNotifData?.unreadCount || 0;
  const unreadChatCount = conversations.reduce(
    (sum, c) => sum + (c.unreadCount || 0),
    0,
  );

  useEffect(() => {
    if (!isAuthenticated) {
      socketService.disconnect();
      return;
    }

    if (!accessToken) {
      return;
    }

    socketService.connect();

    const resyncFromRest = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    const unsubNotif = socketService.onNewNotification(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    const unsubMsg = socketService.onNewMessage(() => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    });

    const unsubReconnect = socketService.onReconnect(() => {
      resyncFromRest();
    });

    const unsubAuthError = socketService.onAuthError((err) => {
      if (err.code === 'ACCOUNT_LOCKED' || err.code === 'SESSION_REVOKED') {
        navigate(
          `/login?sessionError=${encodeURIComponent(err.message || 'Phiên đăng nhập không còn hiệu lực')}`,
          { replace: true },
        );
      }
    });

    const handleOnline = () => {
      socketService.connect();
      resyncFromRest();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsubNotif();
      unsubMsg();
      unsubReconnect();
      unsubAuthError();
      window.removeEventListener('online', handleOnline);
    };
  }, [isAuthenticated, accessToken, queryClient, navigate]);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // clear local state regardless
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200/80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo & Search */}
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <Link to="/feed" className="flex items-center gap-2.5 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center shadow-sm">
                <Mountain className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-stone-900">
                  Travel<span className="text-emerald-700">Share</span>
                </span>
                <span className="block text-[10px] font-medium text-stone-500 -mt-1">
                  Social • Gear • AI
                </span>
              </div>
            </Link>

            <form
              onSubmit={handleSearchSubmit}
              className="hidden sm:flex items-center flex-1 relative"
            >
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm cung trekking, lều trại, balo, hashtag..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-stone-100 hover:bg-stone-200/60 focus:bg-white rounded-xl border border-transparent focus:border-emerald-600 focus:outline-none transition-colors"
              />
            </form>
          </div>

          {/* Primary Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {[
              ...NAV_ITEMS,
              ...(user?.role === 'ADMIN'
                ? [{ to: '/admin', label: 'Quản trị', icon: ShieldCheck }]
                : []),
            ].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                  )
                }
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Actions: Notifications, Messages, User Avatar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="p-2.5 rounded-xl text-stone-600 hover:bg-stone-100 relative"
              title="Thông báo giao dịch"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center absolute -top-0.5 -right-0.5 shadow">
                  {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/messages')}
              className="p-2.5 rounded-xl text-stone-600 hover:bg-stone-100 relative"
              title="Tin nhắn trao đổi"
            >
              <MessageSquare className="w-5 h-5" />
              {unreadChatCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center absolute -top-0.5 -right-0.5 shadow">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>

            {isAuthenticated && user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
                <Link
                  to={`/users/${user.profile?.username || user.id}`}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-stone-100 transition-colors"
                >
                  <img
                    src={
                      user.profile?.avatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.profile?.fullName || user.email)}&background=166534&color=fff`
                    }
                    alt={user.profile?.fullName || user.email}
                    className="w-8 h-8 rounded-full object-cover border border-emerald-200"
                  />
                  <div className="hidden md:block text-left">
                    <p className="text-xs font-semibold text-stone-900 leading-tight">
                      {user.profile?.fullName || user.email}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      @{user.profile?.username || 'member'}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-stone-200">
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Đăng nhập
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    Đăng ký
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-xl text-stone-700 hover:bg-stone-100"
              aria-label="Mở menu điều hướng"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-stone-200 bg-white px-4 py-3 space-y-2">
            <form onSubmit={handleSearchSubmit} className="relative mb-2">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm thiết bị, địa điểm..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-stone-100 rounded-xl focus:outline-none"
              />
            </form>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ...NAV_ITEMS,
                ...(user?.role === 'ADMIN'
                  ? [{ to: '/admin', label: 'Quản trị', icon: ShieldCheck }]
                  : []),
              ].map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium',
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : 'text-stone-700 hover:bg-stone-100',
                    )
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            {!isAuthenticated ? (
              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full" size="sm">
                    Đăng nhập
                  </Button>
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1"
                >
                  <Button variant="primary" className="w-full" size="sm">
                    Đăng ký
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                <Link
                  to="/settings/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-sm font-medium text-stone-800"
                >
                  <User className="w-4 h-4 text-emerald-700" />
                  Hồ sơ cá nhân ({user?.profile?.fullName})
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Đăng xuất
                </Button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
