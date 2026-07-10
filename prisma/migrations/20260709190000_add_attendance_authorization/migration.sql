-- Autorização anti-fraude de atendimento (agendamento/retorno). Aditiva.
CREATE TABLE IF NOT EXISTS "seller_attendance_authorizations" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "unitId"          TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "visitType"       TEXT NOT NULL,
    "customerName"    TEXT,
    "customerPhone"   TEXT,
    "customerEmail"   TEXT,
    "notes"           TEXT,
    "status"          TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt"       TIMESTAMP(3),
    "decisionReason"  TEXT,
    "attendanceId"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"       TIMESTAMP(3),

    CONSTRAINT "seller_attendance_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saa_tenant_unit_status_idx" ON "seller_attendance_authorizations"("tenantId", "unitId", "status");
CREATE INDEX IF NOT EXISTS "saa_requester_status_idx" ON "seller_attendance_authorizations"("requesterUserId", "status");
