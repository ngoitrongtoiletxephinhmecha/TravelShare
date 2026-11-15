import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BookingStatus } from '../../common/enums/system.enums';

export type BookingActorRole = 'RENTER' | 'OWNER' | 'ADMIN' | 'SYSTEM';

interface TransitionRule {
  from: BookingStatus[];
  to: BookingStatus;
  allowedActors: BookingActorRole[];
  description: string;
}

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: [BookingStatus.PENDING],
    to: BookingStatus.APPROVED,
    allowedActors: ['OWNER'],
    description: 'Chủ thiết bị chấp nhận yêu cầu thuê/mượn',
  },
  {
    from: [BookingStatus.PENDING],
    to: BookingStatus.REJECTED,
    allowedActors: ['OWNER'],
    description: 'Chủ thiết bị từ chối yêu cầu thuê/mượn',
  },
  {
    from: [BookingStatus.PENDING, BookingStatus.APPROVED],
    to: BookingStatus.CANCELLED,
    allowedActors: ['RENTER', 'OWNER', 'ADMIN'],
    description: 'Hủy yêu cầu thuê trước khi bàn giao thiết bị',
  },
  {
    from: [BookingStatus.PENDING],
    to: BookingStatus.EXPIRED,
    allowedActors: ['SYSTEM', 'ADMIN'],
    description: 'Yêu cầu thuê tự động hết hạn do quá thời hạn phản hồi',
  },
  {
    from: [BookingStatus.APPROVED],
    to: BookingStatus.IN_USE,
    allowedActors: ['RENTER', 'OWNER'],
    description: 'Hai bên xác nhận bàn giao thiết bị thành công',
  },
  {
    from: [BookingStatus.IN_USE],
    to: BookingStatus.RETURN_PENDING,
    allowedActors: ['RENTER', 'OWNER'],
    description: 'Yêu cầu hoàn trả thiết bị, chờ xác nhận kiểm tra hai bên',
  },
  {
    from: [BookingStatus.IN_USE, BookingStatus.RETURN_PENDING],
    to: BookingStatus.COMPLETED,
    allowedActors: ['RENTER', 'OWNER', 'ADMIN'],
    description: 'Hoàn trả thiết bị và xác nhận hoàn tất giao dịch',
  },
  {
    from: [
      BookingStatus.APPROVED,
      BookingStatus.IN_USE,
      BookingStatus.RETURN_PENDING,
    ],
    to: BookingStatus.DISPUTED,
    allowedActors: ['RENTER', 'OWNER', 'ADMIN'],
    description: 'Mở khiếu nại / tranh chấp giao dịch thiết bị',
  },
  {
    from: [BookingStatus.DISPUTED],
    to: BookingStatus.COMPLETED,
    allowedActors: ['ADMIN'],
    description: 'Admin giải quyết tranh chấp và đóng giao dịch hoàn tất',
  },
  {
    from: [BookingStatus.DISPUTED],
    to: BookingStatus.CANCELLED,
    allowedActors: ['ADMIN'],
    description: 'Admin giải quyết tranh chấp và hủy giao dịch',
  },
];

export class BookingStateMachine {
  /**
   * Determine actor role in a booking context
   */
  static resolveActorRole(
    userId: string,
    userSystemRole: string,
    booking: { renterId: any; ownerId: any },
  ): BookingActorRole {
    if (String(booking.ownerId) === String(userId)) {
      return 'OWNER';
    }
    if (String(booking.renterId) === String(userId)) {
      return 'RENTER';
    }
    if (userSystemRole === 'ADMIN') {
      return 'ADMIN';
    }
    throw new ForbiddenException(
      'Bạn không phải là người tham gia giao dịch thuê/mượn này',
    );
  }

  /**
   * Validate whether transitioning from `currentStatus` to `targetStatus` by `actorRole` is allowed
   */
  static assertValidTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
    actorRole: BookingActorRole,
  ): void {
    const terminalStatuses: BookingStatus[] = [
      BookingStatus.COMPLETED,
      BookingStatus.REJECTED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ];

    if (terminalStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Giao dịch đã kết thúc ở trạng thái ${currentStatus}, không thể chuyển sang ${targetStatus}`,
      );
    }

    const matchingRule = TRANSITION_RULES.find(
      (rule) =>
        rule.to === targetStatus && rule.from.includes(currentStatus),
    );

    if (!matchingRule) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái giao dịch từ ${currentStatus} sang ${targetStatus}`,
      );
    }

    if (!matchingRule.allowedActors.includes(actorRole)) {
      throw new ForbiddenException(
        `Vai trò ${actorRole} không có quyền chuyển trạng thái từ ${currentStatus} sang ${targetStatus}`,
      );
    }
  }
}
