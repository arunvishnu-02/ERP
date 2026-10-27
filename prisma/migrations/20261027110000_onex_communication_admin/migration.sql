-- 1X System: only Admin opens Communication (its templates show invoice and quotation amounts).
DELETE FROM "RolePermission" rp USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  AND r."key" <> 'SUPER_ADMIN' AND p."module"::text = 'COMMUNICATION';
