import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminRoles1757003300000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE admin_roles (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name citext NOT NULL UNIQUE,
        description text NOT NULL DEFAULT '',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE admin_role_permissions (
        "roleId" uuid NOT NULL,
        "permissionId" uuid NOT NULL,
        PRIMARY KEY ("roleId", "permissionId"),
        CONSTRAINT "admin_role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES admin_roles(id) ON DELETE CASCADE,
        CONSTRAINT "admin_role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES permissions(id) ON DELETE CASCADE
      );
      ALTER TABLE admins ADD COLUMN "roleId" uuid,
        ADD CONSTRAINT "admins_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES admin_roles(id) ON DELETE RESTRICT;
    `);
    // Group identical existing grants without adding or removing any access.
    await q.query(`
      DO $$ DECLARE entry record; role_id uuid; n integer := 0; BEGIN
        FOR entry IN
          SELECT array_agg(a.id) AS admins, grants.ids
          FROM admins a
          CROSS JOIN LATERAL (SELECT COALESCE(array_agg(ap."permissionId" ORDER BY ap."permissionId"), '{}'::uuid[]) AS ids
            FROM admin_permissions ap WHERE ap."adminId" = a.id) grants
          GROUP BY grants.ids
        LOOP
          n := n + 1;
          INSERT INTO admin_roles(name, description) VALUES (
            CASE WHEN cardinality(entry.ids) = (SELECT count(*) FROM permissions) THEN 'Super Admin' ELSE 'Existing role ' || n END,
            'Preserved from existing admin permissions. Rename this role to describe the team.'
          ) RETURNING id INTO role_id;
          INSERT INTO admin_role_permissions ("roleId", "permissionId") SELECT role_id, unnest(entry.ids);
          UPDATE admins SET "roleId" = role_id WHERE id = ANY(entry.admins);
        END LOOP;
      END $$;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    // Preserve each admin's current effective grants if an older release is restored.
    await q.query(`
      DELETE FROM admin_permissions ap USING admins a WHERE ap."adminId" = a.id AND a."roleId" IS NOT NULL;
      INSERT INTO admin_permissions ("adminId", "permissionId")
        SELECT a.id, rp."permissionId" FROM admins a JOIN admin_role_permissions rp ON rp."roleId" = a."roleId";
      ALTER TABLE admins DROP COLUMN "roleId";
      DROP TABLE admin_role_permissions;
      DROP TABLE admin_roles;
    `);
  }
}
