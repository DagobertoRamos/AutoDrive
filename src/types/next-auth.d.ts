// =============================================================================
// NextAuth type augmentation — AutoDrive
// =============================================================================

import { type DefaultSession } from 'next-auth'
import { type UserRole, type UserStatus } from './index'

declare module 'next-auth' {
  interface Session {
    user: {
      id:                 string
      name:               string
      email:              string
      role:               UserRole
      status:             UserStatus
      unitId:             string | null
      tenantId:           string | null  // null = usuário de plataforma (MASTER)
      image?:             string | null
      mustChangePassword?: boolean
    } & DefaultSession['user']
  }

  interface User {
    id:                 string
    name:               string
    email:              string
    role:               UserRole
    status:             UserStatus
    unitId:             string | null
    tenantId:           string | null
    image?:             string | null
    mustChangePassword?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id:                 string
    role:               UserRole
    status:             UserStatus
    unitId:             string | null
    tenantId:           string | null
    mustChangePassword?: boolean
  }
}
