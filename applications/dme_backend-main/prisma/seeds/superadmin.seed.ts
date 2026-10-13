import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedSuperadmin(prisma: PrismaClient) {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const firstName = process.env.SUPERADMIN_FIRST_NAME;
  const lastName = process.env.SUPERADMIN_LAST_NAME;
  const phone = process.env.SUPERADMIN_PHONE;

  if (!email || !password || !firstName || !lastName) {
    console.error(
      'Superadmin seed failed: Missing required environment variables (SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_FIRST_NAME, SUPERADMIN_LAST_NAME)',
    );
    process.exit(1);
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  try {
    const existingSuperadmin = await prisma.superadmin.findUnique({
      where: { email },
    });

    if (existingSuperadmin) {
      await prisma.superadmin.update({
        where: { id: existingSuperadmin.id },
        data: {
          password_hash: passwordHash,
          first_name: firstName,
          last_name: lastName,
          phone: phone ?? existingSuperadmin.phone,
        },
      });
      console.log('Superadmin updated successfully.');
      return;
    }

    await prisma.account.create({
      data: {
        account_type: 'SUPERADMIN',
        superadmin: {
          create: {
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            phone,
            status: 'PENDING',
          },
        },
      },
    });

    console.log('Superadmin created successfully.');
  } catch (error) {
    console.error('Failed to seed superadmin:', error);
    process.exit(1);
  }
}
