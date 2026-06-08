/**
 * Compat: o modelo de papéis virou configurável no banco (ver permissions.ts).
 * Este arquivo só re-exporta o que telas antigas importam daqui, pra não
 * quebrar os imports existentes.
 */
import "server-only"

export {
  getAccessibleUnitIds,
  getCurrentHoldingId,
  isSuperadmin,
  getCurrentRole,
  userCan,
  getRolesConfig,
  MODULES,
  type ModuleKey,
  type PermAction,
  type RoleConfig,
} from "@/lib/auth/permissions"
