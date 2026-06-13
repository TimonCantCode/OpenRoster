# OpenRoster

OpenRoster is a multi-tenant web application for shift scheduling, employee
management and hour balances. It is designed for self-hosting and can also be
operated as a SaaS product.

## MVP features

- Owner registration with an organization
- Email/password authentication with Argon2id and server-side sessions
- `OWNER`, `ADMIN` and `EMPLOYEE` roles
- Employee invitations via SMTP
- Weekly and list-based shift schedule
- Reusable standard shifts and recurring series by weekday
- Company working days and per-employee weekday availability
- Configurable maximum employees per shift, defaulting to one
- Direct availability-aware assignment from list and calendar views
- Weekly calendar and grouped list schedule views
- Personal shift view for employees
- Target, worked and plus/minus hours
- Manual hour adjustments
- English interface by default, optional German account language
- Audit log for critical actions
- PostgreSQL tenant isolation and server-side authorization
- Docker Compose setup with migrations and health checks

## Requirements

- Docker with Docker Compose, or
- Node.js 20.9+ and PostgreSQL 16+

## Docker quickstart

```bash
git clone https://github.com/your-org/openroster.git
cd openroster
cp .env.example .env
```

Change at least these values in `.env`:

```env
APP_URL=http://localhost:3000
APP_SECRET=<at-least-32-random-characters>
POSTGRES_PASSWORD=<strong-database-password>
DATABASE_URL=postgresql://openroster:<same-password>@postgres:5432/openroster
```

Start the stack:

```bash
docker compose up -d --build
```

Open `http://localhost:3000`. Database migrations are applied automatically
when the app container starts. Create the first owner at `/auth/register`.

Status and logs:

```bash
docker compose ps
docker compose logs -f app
```

## Optional owner seed

You can seed the first owner instead of using the registration page:

```env
RUN_SEED=true
SEED_OWNER_EMAIL=owner@example.com
SEED_OWNER_PASSWORD=<at-least-12-characters>
SEED_OWNER_NAME=Alex Example
SEED_ORGANIZATION_NAME=Example Company
```

The seed is idempotent and skips existing owner email addresses. Set
`RUN_SEED=false` after the first successful start.

## Local development

```bash
npm install
docker compose up -d postgres mailpit
```

For a Next.js process running outside Docker, use `localhost` as the database
host:

```env
NODE_ENV=development
APP_URL=http://localhost:3000
APP_SECRET=development-secret-with-at-least-32-characters
DATABASE_URL=postgresql://openroster:<password>@localhost:5432/openroster
SMTP_HOST=localhost
SMTP_PORT=1025
```

Then run:

```bash
npm run db:migrate:dev
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Email and SMTP

Docker Compose includes Mailpit for local email testing:

```env
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="OpenRoster <noreply@localhost>"
SMTP_SECURE=false
```

The local inbox is available at `http://localhost:8025`. Mailpit does not
deliver messages to the internet.

For real delivery, replace the SMTP settings with your provider credentials.
Port `465` generally requires `SMTP_SECURE=true`; STARTTLS ports such as `587`
generally use `SMTP_SECURE=false`.

## Environment variables

| Variable | Description |
| --- | --- |
| `APP_URL` | Public base URL without a trailing slash |
| `APP_SECRET` | At least 32 characters; unsafe production values stop startup |
| `DATABASE_URL` | PostgreSQL connection URL |
| `SESSION_TTL_DAYS` | Session lifetime, maximum 90 days |
| `INVITE_TOKEN_TTL_DAYS` | Invitation lifetime, maximum 30 days |
| `SMTP_*` | SMTP server and authentication settings |

See [`.env.example`](.env.example) for the complete list.

## Database and migrations

Create a migration during development:

```bash
npm run db:migrate:dev
```

Apply existing migrations:

```bash
npm run db:migrate
```

## Backup and restore

Create a backup:

```bash
docker compose exec -T postgres pg_dump \
  -U openroster -d openroster -Fc > openroster.backup
```

Restore into an empty database:

```bash
docker compose exec -T postgres pg_restore \
  -U openroster -d openroster --clean --if-exists < openroster.backup
```

Store backups encrypted, test restores regularly and keep copies outside the
production server.

## Security model

- Session and invitation tokens are stored only as SHA-256 hashes.
- Passwords are hashed with Argon2id.
- Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- Sign-in attempts are rate-limited in PostgreSQL.
- Server actions derive the organization from the active session.
- Roles and active membership are checked for every critical action.
- Composite foreign keys protect core tenant boundaries in PostgreSQL.
- Critical changes are written to the audit log.

Report security issues according to [SECURITY.md](SECURITY.md).

## Architecture

```text
Browser
  -> Next.js App Router / Server Actions
  -> Authentication and permission layer
  -> Prisma
  -> PostgreSQL
```

Shift timestamps are stored as UTC. Each organization has an explicit IANA
time zone for input and display.

Target hours accrue proportionally from the membership creation timestamp.
A newly created account therefore starts at a zero balance instead of
receiving a target for earlier days in the month.

## Roadmap

- Leave and sickness
- Shift swaps
- Calendar synchronization
- Premium and holiday rules
- Data export and additional GDPR tools
- Notifications
- Teams, locations and fine-grained permissions
- SaaS billing

## License

OpenRoster is licensed under the
[GNU Affero General Public License v3.0](LICENSE). Contributions are published
under `AGPL-3.0-only`.
