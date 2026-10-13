import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedManager(prisma: PrismaClient) {
  const email = 'manager.youssef@example.com';
  const password = 'password123456';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password_hash: passwordHash,
          status: 'ACTIVE',
          password_reset_required: false,
          failed_login_attempts: 0,
          locked_until: null,
          mfa_enabled: false,
        },
      });
      console.log(
        `Manager ${email} password updated to ${password} successfully.`,
      );
      return;
    }

    await prisma.account.create({
      data: {
        account_type: 'USER',
        user: {
          create: {
            email,
            password_hash: passwordHash,
            first_name: 'Youssef',
            last_name: 'Mansour',
            phone: '+216 20 000 001',
            role: 'MANAGER',
            status: 'ACTIVE',
            mfa_enabled: false,
            password_reset_required: false,
          },
        },
      },
    });

    console.log(
      `Manager ${email} created successfully with password ${password}.`,
    );
  } catch (error) {
    console.error('Failed to seed manager:', error);
  }
}
