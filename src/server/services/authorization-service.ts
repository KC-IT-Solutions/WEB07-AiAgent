export interface CurrentUserCapabilities {
  isAdmin: boolean;
}

export class AuthorizationService {
  constructor(
    private readonly currentUserId: () => number,
    private readonly adminUserIds: ReadonlySet<number> = new Set([1]),
  ) {}

  getCurrentUserCapabilities(): CurrentUserCapabilities {
    return { isAdmin: this.adminUserIds.has(this.getCurrentUserId()) };
  }

  getCurrentUserId(): number {
    return this.currentUserId();
  }

  isCurrentUserAdmin(): boolean {
    return this.getCurrentUserCapabilities().isAdmin;
  }
}
