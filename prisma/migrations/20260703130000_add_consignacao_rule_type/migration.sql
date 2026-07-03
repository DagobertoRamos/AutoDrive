-- Adiciona CONSIGNACAO ao enum de tipos de regra de comissao.
-- Non-destructive: ALTER TYPE ... ADD VALUE.
ALTER TYPE "CommissionRuleType" ADD VALUE IF NOT EXISTS 'CONSIGNACAO';
