import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import configuration, {
  validateRuntimeConfig,
} from '../../config/configuration';
import {
  AccountStatus,
  BookingStatus,
  GearCondition,
  GearListingType,
  GearModerationStatus,
  GearStatus,
  UserRole,
} from '../../common/enums/system.enums';
import { verifyCsrfForCookieRequest } from '../../common/guards/jwt-auth.guard';
import { AuthEventsService } from './auth-events.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RealtimeGateway } from '../chats/realtime.gateway';
import { MediaService } from '../media/media.service';
import { BookingEventsService } from '../bookings/booking-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityService } from '../gear/availability.service';
import { GearService } from '../gear/gear.service';

describe('Phase 9D Security, Google OAuth, Media ACL & Durable Outbox Suite', () => {
  const userAId = new Types.ObjectId(); // Owner A
  const userBId = new Types.ObjectId(); // Renter B
  const userCId = new Types.ObjectId(); // Unrelated Account C
  const gearId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();

  const PNG_HEADER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]);

  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('1. Validates production startup config: rejects fallback/duplicate JWT secrets & demo DBs', () => {
    const mkConfig = (overrides: Record<string, any>) =>
      ({
        get: (key: string) => overrides[key],
      }) as unknown as ConfigService;

    // Duplicate JWT secrets in production -> fail fast
    expect(() =>
      validateRuntimeConfig(
        mkConfig({
          nodeEnv: 'production',
          'jwt.accessSecret': 'a-very-long-production-secret-key-over-32-chars',
          'jwt.refreshSecret': 'a-very-long-production-secret-key-over-32-chars',
          'database.uri': 'mongodb://prod-host:27017/travelshare',
          frontendUrl: 'https://travelshare.vn',
          'jwt.cookieSameSite': 'lax',
          'jwt.cookieSecure': true,
          'storage.driver': 'local',
          'storage.allowLocalInProduction': true,
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET và JWT_REFRESH_SECRET không được phép giống nhau/);

    // Demo DB name in production -> fail fast
    expect(() =>
      validateRuntimeConfig(
        mkConfig({
          nodeEnv: 'production',
          'jwt.accessSecret': 'prod-access-secret-key-over-32-characters-111',
          'jwt.refreshSecret': 'prod-refresh-secret-key-over-32-characters-222',
          'database.uri': 'mongodb://localhost:27017/travelshare_demo',
          frontendUrl: 'https://travelshare.vn',
          'jwt.cookieSameSite': 'lax',
          'jwt.cookieSecure': true,
          'storage.driver': 'local',
          'storage.allowLocalInProduction': true,
        }),
      ),
    ).toThrow(/database demo/i);

    // Valid production config passes
    process.env.ALLOW_DEMO_SEED = 'false';
    process.env.ALLOW_DEMO_DATA = 'false';
    process.env.DEMO_MODE = 'false';
    expect(() =>
      validateRuntimeConfig(
        mkConfig({
          nodeEnv: 'production',
          'jwt.accessSecret': 'prod-access-secret-key-over-32-characters-111',
          'jwt.refreshSecret': 'prod-refresh-secret-key-over-32-characters-222',
          'database.uri': 'mongodb://prod-cluster/travelshare',
          frontendUrl: 'https://travelshare.vn',
          'jwt.cookieSameSite': 'none',
          'jwt.cookieSecure': true,
          'storage.driver': 'cloudinary',
          'storage.cloudinaryCloudName': 'cloud',
          'storage.cloudinaryApiKey': 'key',
          'storage.cloudinaryApiSecret': 'secret',
        }),
      ),
    ).not.toThrow();
  });

  it('2. Blocks demo gear items in Marketplace & AvailabilityService when NODE_ENV=production', async () => {
    const demoGear = {
      _id: gearId,
      ownerId: userAId,
      categoryCode: 'TENT',
      title: '[DEMO] Lều test',
      description: 'Demo',
      condition: GearCondition.GOOD,
      sharingType: GearListingType.RENT,
      pricePerDay: 50000,
      depositAmount: 100000,
      city: 'Hà Nội',
      district: 'Đống Đa',
      pickupLocation: { type: 'Point', coordinates: [105.8, 21.0] },
      status: GearStatus.ACTIVE,
      moderationStatus: GearModerationStatus.APPROVED,
      isActive: true,
      isDemo: true,
    };

    const prodConfig: any = {
      get: (k: string) => (k === 'isProduction' ? true : k === 'nodeEnv' ? 'production' : undefined),
    };
    const devConfig: any = {
      get: (k: string) => (k === 'isProduction' ? false : k === 'nodeEnv' ? 'development' : undefined),
    };

    const availabilityProd = new AvailabilityService(
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) } as any,
      { findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(demoGear) }) } as any,
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) } as any,
      undefined,
      prodConfig,
    );
    expect(availabilityProd.isGearEligibleForBooking(demoGear).eligible).toBe(
      false,
    );

    const gearFindCalls: any[] = [];
    const gearServiceProd = new GearService(
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) } as any,
      {
        find: jest.fn().mockImplementation((q) => {
          gearFindCalls.push(q);
          return { lean: jest.fn().mockResolvedValue([]) };
        }),
        findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(demoGear) }),
      } as any,
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) } as any,
      {} as any,
      availabilityProd,
      prodConfig,
    );

    await gearServiceProd.searchGear({});
    expect(JSON.stringify(gearFindCalls[0])).toContain('"isDemo":{"$ne":true}');
    await expect(gearServiceProd.getGearById(String(gearId))).rejects.toThrow();

    const availabilityDev = new AvailabilityService(
      {} as any,
      {} as any,
      {} as any,
      undefined,
      devConfig,
    );
    expect(availabilityDev.isGearEligibleForBooking(demoGear).eligible).toBe(
      true,
    );
  });

  it('3. Google OAuth creates/links user, enforces CSRF, and Socket.IO disconnects revoked & locked users', async () => {
    const users = new Map<string, any>();
    const profiles = new Map<string, any>();

    const mockUserModel: any = {
      findOne: jest.fn().mockImplementation((q: any) => {
        const resolveUser = async () => {
          for (const u of users.values()) {
            if (q?.email && u.email === q.email) return u;
            if (
              Array.isArray(q?.$or) &&
              q.$or.some(
                (cond: any) =>
                  (cond.googleId && u.googleId === cond.googleId) ||
                  (cond.email && u.email === cond.email),
              )
            ) {
              return u;
            }
          }
          return null;
        };
        return {
          select: jest.fn().mockImplementation(() => resolveUser()),
          then: (onFulfilled: any, onRejected: any) =>
            resolveUser().then(onFulfilled, onRejected),
        };
      }),
      findById: jest.fn().mockImplementation((id: string) => ({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(users.get(String(id)) || null),
        }),
        lean: jest.fn().mockResolvedValue(users.get(String(id)) || null),
      })),
      findByIdAndUpdate: jest.fn().mockImplementation(async (id: string, upd: any) => {
        const u = users.get(String(id));
        if (u && upd?.$set?.refreshSessions) {
          u.refreshSessions = upd.$set.refreshSessions;
        }
        return u;
      }),
      create: jest.fn().mockImplementation(async (doc: any) => {
        const id = String(userBId);
        const saved = {
          _id: userBId,
          ...doc,
          save: jest.fn().mockImplementation(async () => saved),
        };
        users.set(id, saved);
        return saved;
      }),
    };

    const mockProfileModel: any = {
      findOne: jest.fn().mockImplementation(async (q: any) => {
        for (const p of profiles.values()) {
          if (q?.userId && String(p.userId) === String(q.userId)) return p;
          if (q?.username && p.username === q.username) return p;
        }
        return null;
      }),
      create: jest.fn().mockImplementation(async (doc: any) => {
        profiles.set(String(doc.userId), doc);
        return doc;
      }),
    };

    const jwtService = new JwtService({});
    const configService = new ConfigService(configuration());
    const authEventsService = new AuthEventsService();

    const authService = new AuthService(
      mockUserModel,
      mockProfileModel,
      jwtService,
      configService,
      authEventsService,
    );

    const googleRes = await authService.loginWithGoogle({
      googleId: 'google-sub-12345',
      email: 'renter.b@gmail.com',
      fullName: 'Người Thuê B',
      avatarUrl: 'https://lh3.googleusercontent.com/avatar.jpg',
      emailVerified: true,
    });

    expect(googleRes.user.email).toBe('renter.b@gmail.com');
    expect(googleRes.user.emailVerified).toBe(true);
    expect(googleRes.accessToken).toBeTruthy();

    const decoded: any = jwtService.verify(googleRes.accessToken, {
      secret: configService.get<string>('jwt.accessSecret'),
    });

    // JwtStrategy accepts active session
    const jwtStrategy = new JwtStrategy(configService, mockUserModel);
    const validUser = await jwtStrategy.validate(decoded);
    expect(validUser.userId).toBe(String(userBId));

    // CSRF rejects mismatch & accepts match
    expect(() =>
      verifyCsrfForCookieRequest(
        {
          headers: { origin: 'http://localhost:5173', 'x-csrf-token': 'wrong' },
          cookies: { ts_csrf_token: 'correct-csrf-token-123456' },
        } as any,
        ['http://localhost:5173'],
        false,
      ),
    ).toThrow(ForbiddenException);

    expect(() =>
      verifyCsrfForCookieRequest(
        {
          headers: {
            origin: 'http://localhost:5173',
            'x-csrf-token': 'correct-csrf-token-123456',
          },
          cookies: { ts_csrf_token: 'correct-csrf-token-123456' },
        } as any,
        ['http://localhost:5173'],
        false,
      ),
    ).not.toThrow();

    // RealtimeGateway checks DB active status + session & disconnects on lock
    const gateway = new RealtimeGateway(
      jwtService,
      configService,
      { getConversationById: jest.fn(), sendMessage: jest.fn(), markConversationRead: jest.fn() } as any,
      { registerRealtimeDispatcher: jest.fn() } as any,
      mockUserModel,
      authEventsService,
    );

    const mockSocket: any = {
      id: 'sock-1',
      handshake: {
        auth: { token: googleRes.accessToken },
        headers: {},
      },
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    gateway.server = {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([mockSocket]),
      }),
    } as any;
    gateway.onModuleInit();

    await gateway.handleConnection(mockSocket);
    expect(mockSocket.join).toHaveBeenCalledWith(`user:${String(userBId)}`);

    // Lock user B & trigger session revocation -> both HTTP JwtStrategy & Socket reject/disconnect
    const dbUserB = users.get(String(userBId));
    dbUserB.status = AccountStatus.SUSPENDED;
    dbUserB.refreshSessions = [];
    authEventsService.emitSessionRevoked({
      userId: String(userBId),
      reason: 'ACCOUNT_LOCKED',
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth:error',
      expect.objectContaining({ code: 'ACCOUNT_LOCKED' }),
    );
    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    await expect(jwtStrategy.validate(decoded)).rejects.toThrow(
      ForbiddenException,
    );

    // Unlock user B but keep refreshSessions empty -> revoked session rejected
    dbUserB.status = AccountStatus.ACTIVE;
    await expect(jwtStrategy.validate(decoded)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('4. Media ACL: magic-byte validation, public persistence after restart, and booking A/B/C isolation', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-media-9d-'));
    const localDir = path.join(tmpRoot, 'uploads');
    const privateDir = path.join(tmpRoot, 'private_uploads');

    const mediaStore = new Map<string, any>();
    const bookingStore = new Map<string, any>([
      [
        String(bookingId),
        {
          _id: bookingId,
          ownerId: userAId,
          renterId: userBId,
          status: BookingStatus.IN_USE,
        },
      ],
    ]);

    const mockMediaModel: any = {
      create: jest.fn().mockImplementation(async (doc: any) => {
        const saved = { ...doc, _id: doc._id || new Types.ObjectId() };
        mediaStore.set(String(saved._id), saved);
        return saved;
      }),
      findById: jest.fn().mockImplementation((id: string) => {
        const rec = mediaStore.get(String(id)) || null;
        return {
          ...rec,
          lean: jest.fn().mockResolvedValue(rec),
        };
      }),
      findOne: jest.fn().mockImplementation((q: any) => {
        let found: any = null;
        for (const item of mediaStore.values()) {
          if (q?.publicId && item.publicId === q.publicId) {
            found = item;
            break;
          }
        }
        return {
          ...found,
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(found),
          }),
          lean: jest.fn().mockResolvedValue(found),
        };
      }),
    };

    const mockBookingModel: any = {
      findById: jest.fn().mockImplementation((id: string) => ({
        lean: jest.fn().mockResolvedValue(bookingStore.get(String(id)) || null),
      })),
    };

    const mediaConfig: any = {
      get: (key: string) => {
        const map: Record<string, any> = {
          'storage.driver': 'auto',
          'storage.localDir': localDir,
          'storage.privateDir': privateDir,
          apiPrefix: 'api/v1',
        };
        return map[key];
      },
    };

    const mediaService = new MediaService(
      mockMediaModel,
      mediaConfig,
      mockBookingModel,
    );

    expect(mediaService.getStorageStatus().activeDriver).toBe('local');

    // Spoofed text file claiming image/png -> rejected before saving
    expect(() =>
      mediaService.validateFile({
        originalname: 'evil.png',
        mimetype: 'image/png',
        size: 16,
        buffer: Buffer.from('<script>alert(1)</script>'),
      } as any),
    ).toThrow(BadRequestException);

    // Public upload persists on disk and stays readable after restart
    const [publicUpload] = await mediaService.uploadFiles(
      String(userAId),
      [
        {
          originalname: 'tent.png',
          mimetype: 'image/png',
          size: PNG_HEADER.length,
          buffer: PNG_HEADER,
        } as any,
      ],
      'http://localhost:4000',
    );
    expect(publicUpload.visibility).toBe('PUBLIC');
    expect(fs.existsSync(path.join(localDir, mediaStore.get(publicUpload.id).storageKey))).toBe(true);

    // Private booking handover upload by A
    const [privateUpload] = await mediaService.uploadFiles(
      String(userAId),
      [
        {
          originalname: 'handover.png',
          mimetype: 'image/png',
          size: PNG_HEADER.length,
          buffer: PNG_HEADER,
        } as any,
      ],
      'http://localhost:4000',
      {
        scope: 'BOOKING_HANDOVER',
        bookingId: String(bookingId),
        userRole: UserRole.USER,
      },
    );
    expect(privateUpload.visibility).toBe('BOOKING_PARTICIPANTS');
    expect(privateUpload.url).toContain(`/api/v1/media/assets/${privateUpload.id}`);

    // Re-instantiate MediaService (simulating server restart)
    const restartedMediaService = new MediaService(
      mockMediaModel,
      mediaConfig,
      mockBookingModel,
    );

    // Public image still accessible after restart
    const pubStream = await restartedMediaService.getAuthorizedMediaStreamInfo(
      publicUpload.id,
    );
    expect(fs.existsSync(pubStream.filePath!)).toBe(true);

    // Account A (owner) & Account B (renter) CAN view booking evidence
    const ownerStream = await restartedMediaService.getAuthorizedMediaStreamInfo(
      privateUpload.id,
      String(userAId),
      UserRole.USER,
    );
    expect(fs.existsSync(ownerStream.filePath!)).toBe(true);

    const renterStream = await restartedMediaService.getAuthorizedMediaStreamInfo(
      privateUpload.id,
      String(userBId),
      UserRole.USER,
    );
    expect(fs.existsSync(renterStream.filePath!)).toBe(true);

    // Unauthenticated & Unrelated Account C CANNOT view booking evidence
    await expect(
      restartedMediaService.getAuthorizedMediaStreamInfo(privateUpload.id),
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      restartedMediaService.getAuthorizedMediaStreamInfo(
        privateUpload.id,
        String(userCId),
        UserRole.USER,
      ),
    ).rejects.toThrow(ForbiddenException);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('5. Durable Outbox recovers missed booking.approved notification after restart without duplicates', async () => {
    const outboxStore = new Map<string, any>();
    const notificationsStore = new Map<string, any>();

    const mockOutboxModel: any = {
      create: jest.fn().mockImplementation(async (docOrArr: any) => {
        const isArr = Array.isArray(docOrArr);
        const doc = isArr ? docOrArr[0] : docOrArr;
        for (const existing of outboxStore.values()) {
          if (existing.transitionKey === doc.transitionKey) {
            const err: any = new Error('Duplicate key');
            err.code = 11000;
            throw err;
          }
        }
        const saved = { ...doc, _id: new Types.ObjectId(), createdAt: new Date() };
        outboxStore.set(String(saved._id), saved);
        return isArr ? [saved] : saved;
      }),
      find: jest.fn().mockImplementation((q: any) => {
        const list = Array.from(outboxStore.values()).filter(
          (o) => !q?.status || o.status === q.status,
        );
        return {
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(list),
            }),
          }),
        };
      }),
      findOne: jest.fn().mockImplementation((q: any) => ({
        lean: jest.fn().mockResolvedValue(
          Array.from(outboxStore.values()).find(
            (o) =>
              (q?._id && String(o._id) === String(q._id)) ||
              (q?.transitionKey && o.transitionKey === q.transitionKey),
          ) || null,
        ),
      })),
      updateOne: jest.fn().mockImplementation(async (filter: any, upd: any) => {
        for (const o of outboxStore.values()) {
          const match =
            (filter?._id && String(o._id) === String(filter._id)) ||
            (filter?.transitionKey && o.transitionKey === filter.transitionKey);
          if (match && upd?.$set) {
            Object.assign(o, upd.$set);
          }
        }
        return { modifiedCount: 1 };
      }),
    };

    const mockNotificationModel: any = {
      findOne: jest.fn().mockImplementation((q: any) => ({
        lean: jest.fn().mockResolvedValue(
          Array.from(notificationsStore.values()).find(
            (n) => n.dedupeKey === q?.dedupeKey,
          ) || null,
        ),
      })),
      create: jest.fn().mockImplementation(async (doc: any) => {
        for (const existing of notificationsStore.values()) {
          if (existing.dedupeKey === doc.dedupeKey) {
            const err: any = new Error('Duplicate key');
            err.code = 11000;
            throw err;
          }
        }
        const saved = {
          ...doc,
          _id: new Types.ObjectId(),
          createdAt: new Date(),
        };
        notificationsStore.set(String(saved._id), saved);
        return { ...saved, toObject: () => saved };
      }),
      find: jest.fn().mockImplementation((q: any) => {
        const list = Array.from(notificationsStore.values()).filter(
          (n) => String(n.recipientId) === String(q.recipientId),
        );
        return {
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(list),
              }),
            }),
          }),
        };
      }),
      countDocuments: jest.fn().mockImplementation(async (q: any) => {
        return Array.from(notificationsStore.values()).filter(
          (n) => String(n.recipientId) === String(q.recipientId),
        ).length;
      }),
    };

    // Instance 1 records durable outbox inside approval transition, then crashes before dispatch
    const eventsService = new BookingEventsService(mockOutboxModel);
    await eventsService.recordOutbox({
      event: 'booking.approved',
      bookingId: String(bookingId),
      gearId: String(gearId),
      renterId: String(userBId),
      ownerId: String(userAId),
      actorId: String(userAId),
      occurredAt: new Date().toISOString(),
    });
    expect(outboxStore.size).toBe(1);
    expect(notificationsStore.size).toBe(0);

    // Instance 2 starts up after restart while Renter B was offline -> recovers pending outbox
    const notificationsServiceAfterRestart = new NotificationsService(
      mockNotificationModel,
      new BookingEventsService(mockOutboxModel),
      mockOutboxModel,
    );

    const recoveredFirstRun =
      await notificationsServiceAfterRestart.recoverPendingOutboxEvents();
    expect(recoveredFirstRun).toBe(1);

    // Re-running recovery / duplicate event never duplicates notifications
    const recoveredSecondRun =
      await notificationsServiceAfterRestart.recoverPendingOutboxEvents();
    expect(recoveredSecondRun).toBe(0);

    // Renter B comes back online and syncs via REST -> sees EXACTLY ONE notification leading to the booking
    const renterNotifications =
      await notificationsServiceAfterRestart.getMyNotifications(
        String(userBId),
        {},
      );
    expect(renterNotifications.total).toBe(1);
    expect(renterNotifications.items[0].targetUrl).toBe(
      `/bookings/${String(bookingId)}`,
    );
  });
});
