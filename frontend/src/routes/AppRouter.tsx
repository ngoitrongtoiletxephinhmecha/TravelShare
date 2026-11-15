import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { FeedPage } from '../pages/FeedPage';
import { ExplorePage } from '../pages/ExplorePage';
import { PostDetailPage } from '../pages/PostDetailPage';
import { UserProfilePage } from '../pages/UserProfilePage';
import { GearMarketplacePage } from '../pages/GearMarketplacePage';
import { GearDetailPage } from '../pages/GearDetailPage';
import { GearFormPage } from '../pages/GearFormPage';
import { MyGearPage } from '../pages/MyGearPage';
import { ReceivedBookingsPage } from '../pages/ReceivedBookingsPage';
import { SentBookingsPage } from '../pages/SentBookingsPage';
import { BookingDetailPage } from '../pages/BookingDetailPage';
import { MessagesPage } from '../pages/MessagesPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { AiAssistantPage } from '../pages/AiAssistantPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ProfileSettingsPage } from '../pages/ProfileSettingsPage';
import { CommunitiesPage } from '../pages/CommunitiesPage';
import { CommunityDetailPage } from '../pages/CommunityDetailPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/users/:id" element={<UserProfilePage />} />
          <Route path="/gear" element={<GearMarketplacePage />} />
          <Route path="/gear/create" element={<GearFormPage />} />
          <Route path="/gear/:id" element={<GearDetailPage />} />
          <Route path="/gear/:id/edit" element={<GearFormPage />} />
          <Route path="/my-gear" element={<MyGearPage />} />
          <Route path="/bookings/received" element={<ReceivedBookingsPage />} />
          <Route path="/bookings/sent" element={<SentBookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:id" element={<MessagesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/ai-assistant" element={<AiAssistantPage />} />
          <Route path="/ai-assistant/:id" element={<AiAssistantPage />} />
          <Route path="/communities" element={<CommunitiesPage />} />
          <Route path="/communities/:slug" element={<CommunityDetailPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/settings/profile" element={<ProfileSettingsPage />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
