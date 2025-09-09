<div align="center">
  <br />
   <p>
    <img src="https://share.baibusu.social/dgVLYX5L.png">
  </p>

![Discord](https://img.shields.io/discord/162293073718673409?style=for-the-badge&color=%237289da)
![GitHub License](https://img.shields.io/github/license/baibusu-social/auth?style=for-the-badge)
![GitHub Tag](https://img.shields.io/github/v/tag/baibusu-social/auth?style=for-the-badge)

[![Made with Docker](https://img.shields.io/badge/Made_with-Docker-blue?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/ 'Go to Docker homepage')
[![Made with GH Actions](https://img.shields.io/badge/CI-GitHub_Actions-blue?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions 'Go to GitHub Actions homepage')
[![Baibusu.Social](https://img.shields.io/badge/Baibusu.Social-a793b2?style=for-the-badge&logo=misskey&logoColor=white)](https://baibusu.social/ 'Go to Baibusu.Social')

<p>
This application acts as an authentication middleware for Caddy's `forward_auth` directive, integrating with Logto for user authentication. When Caddy receives a request, it forwards the authentication check to this service, which validates the user session with Logto and returns the appropriate response.
</p>

</div>

## Features

- Integration with Logto authentication service
- **Discord guild membership verification** (without requiring a Discord bot)
- Session management with express-session
- Forward authentication endpoints for Caddy
- Health check endpoint
- User profile information in response headers
- Environment-based configuration

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment file and configure:

   ```bash
   copy .env.example .env
   ```

3. Update the `.env` file with your Logto configuration:

   - `LOGTO_ENDPOINT`: Your Logto instance URL
   - `LOGTO_APP_ID`: Your Logto application ID
   - `LOGTO_APP_SECRET`: Your Logto application secret
   - `BASE_URL`: The base URL where this service is running
   - `SESSION_SECRET`: A secure random string for session encryption

4. **Discord Setup** (for guild membership verification):
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application or use an existing one
   - Go to OAuth2 section and note your Client ID and Client Secret
   - Add redirect URI: `http://localhost:3000/discord/callback` (adjust for your domain)
   - Get your Discord Guild (Server) ID from Discord (enable Developer Mode, right-click server, Copy ID)
   - Update `.env` with Discord configuration:
     - `DISCORD_CLIENT_ID`: Your Discord application Client ID
     - `DISCORD_CLIENT_SECRET`: Your Discord application Client Secret
     - `DISCORD_GUILD_ID`: Your Discord server/guild ID
     - `DISCORD_REDIRECT_URI`: The callback URL for Discord OAuth

## Endpoints

### Authentication Endpoints

- `GET /auth` - Full authentication check with JSON response (includes Discord verification)
- `GET /auth/verify` - Simple authentication check for Caddy forward_auth (includes Discord verification)
- `GET /login` - Redirect to Logto sign-in
- `GET /logout` - Redirect to Logto sign-out (also clears Discord session)
- `GET /profile` - Get current user profile with Discord status (authenticated users only)

### Discord Integration Endpoints

- `GET /discord/callback` - Discord OAuth callback endpoint

### Utility Endpoints

- `GET /health` - Health check endpoint

### Logto Integration Endpoints

- `GET /logto/sign-in` - Logto sign-in endpoint
- `GET /logto/sign-out` - Logto sign-out endpoint
- `GET /logto/callback` - Logto callback endpoint

## Response Headers

When authentication is successful, the following headers are set for Caddy to use:

- `X-Auth-User`: User ID
- `X-Auth-Name`: User's display name
- `X-Auth-Email`: User's email address
- `X-Auth-Groups`: Comma-separated list of user groups
- `X-Auth-Roles`: Comma-separated list of user roles
- `X-Discord-User`: Discord user ID
- `X-Discord-Username`: Discord username
- `X-Discord-Roles`: Comma-separated list of Discord roles in the guild

## Caddy Configuration

Here's an example Caddy configuration using this auth forwarder:

```caddyfile
# Your protected site
app.example.com {
    # Forward auth to this service
    forward_auth localhost:3000 {
        uri /auth/verify
        copy_headers X-Auth-User X-Auth-Name X-Auth-Email X-Auth-Groups X-Auth-Roles X-Discord-User X-Discord-Username X-Discord-Roles
    }

    # Your application
    reverse_proxy localhost:8080
}

# Auth service
auth.example.com {
    reverse_proxy localhost:3000
}
```

## Development

Start the development server with auto-reload:

```bash
pnpm run dev
```

Start the production server:

```bash
pnpm start
```

## Docker Deployment

### Building the Docker Image

```bash
# Build the image
docker build -t auth-forwarder .

# Or build with a specific tag
docker build -t baibusu/auth-forwarder:latest .
```

### Running with Docker

#### Option 1: Docker Run (with environment variables)

```bash
docker run -d \
  --name auth-forwarder \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e BASE_URL=https://auth.baibusu.social \
  -e SESSION_SECRET=your-production-session-secret \
  -e LOGTO_ENDPOINT=https://auth.baibusu.social \
  -e LOGTO_APP_ID=your-app-id \
  -e LOGTO_APP_SECRET=your-app-secret \
  -e LOGTO_SCOPES=openid,profile,email \
  -e DISCORD_CLIENT_ID=your-discord-client-id \
  -e DISCORD_CLIENT_SECRET=your-discord-client-secret \
  -e DISCORD_GUILD_ID=your-guild-id \
  -e DISCORD_REDIRECT_URI=https://auth.baibusu.social/discord/callback \
  auth-forwarder
```

#### Option 2: Docker Compose (Recommended)

1. **Create production environment file:**

   ```bash
   wget https://raw.githubusercontent.com/baibusu-social/auth/master/.env.production.example -O .env.production
   wget https://raw.githubusercontent.com/baibusu-social/auth/master/docker-compose.yml
   ```

2. **Edit `.env.production` with your actual values:**

   ```bash
   # Update all the placeholder values with your real configuration
   nano .env.production
   ```

3. **Update docker-compose.yml environment section if needed**

4. **Run with Docker Compose:**

   ```bash
   # Start the service
   docker compose up -d

   # View logs
   docker compose logs -f

   # Stop the service
   docker compose down
   ```

### Docker Environment Configuration

When deploying with Docker, ensure you update these key environment variables:

| Variable               | Development                              | Production                                     |
| ---------------------- | ---------------------------------------- | ---------------------------------------------- |
| `BASE_URL`             | `http://localhost:3000`                  | `https://auth.baibusu.social`                  |
| `DISCORD_REDIRECT_URI` | `http://localhost:3000/discord/callback` | `https://auth.baibusu.social/discord/callback` |
| `SESSION_SECRET`       | Any string                               | Strong, randomly generated secret              |
| `NODE_ENV`             | `development`                            | `production`                                   |

### Important: External Service Configuration

When deploying to production, you must also update:

#### Logto Application Settings:

- **Redirect URI**: Change from `http://localhost:3000/logto/sign-in-callback` to `https://auth.baibusu.social/logto/sign-in-callback`
- **Post-logout URI**: Change from `http://localhost:3000/` to `https://auth.baibusu.social/`
- **CORS origins**: Add `https://auth.baibusu.social`

#### Discord Application Settings:

- **OAuth Redirect URI**: Change from `http://localhost:3000/discord/callback` to `https://auth.baibusu.social/discord/callback`

### Health Checks

The Docker container includes built-in health checks. You can verify the service is running:

```bash
# Check container health
docker ps

# Manual health check
curl https://auth.baibusu.social/health
```

### Logs and Debugging

```bash
# View container logs
docker logs auth-forwarder

# Follow logs in real-time
docker logs -f auth-forwarder

# With docker-compose
docker-compose logs -f auth-forwarder
```

## Environment Variables

| Variable                | Description                       | Default                 |
| ----------------------- | --------------------------------- | ----------------------- |
| `PORT`                  | Server port                       | `3000`                  |
| `NODE_ENV`              | Environment mode                  | `development`           |
| `BASE_URL`              | Base URL of the service           | `http://localhost:3000` |
| `SESSION_SECRET`        | Session encryption secret         | -                       |
| `LOGTO_ENDPOINT`        | Logto instance URL                | -                       |
| `LOGTO_APP_ID`          | Logto application ID              | -                       |
| `LOGTO_APP_SECRET`      | Logto application secret          | -                       |
| `LOGTO_RESOURCES`       | Comma-separated API resources     | -                       |
| `LOGTO_SCOPES`          | Comma-separated OAuth scopes      | `openid,profile`        |
| `DISCORD_CLIENT_ID`     | Discord application Client ID     | -                       |
| `DISCORD_CLIENT_SECRET` | Discord application Client Secret | -                       |
| `DISCORD_GUILD_ID`      | Discord server/guild ID           | -                       |
| `DISCORD_REDIRECT_URI`  | Discord OAuth callback URL        | -                       |

## How Discord Verification Works

1. **User attempts to access protected resource** → Caddy forwards auth check to this service
2. **Logto authentication check** → User must be authenticated with Logto first
3. **Discord guild membership check**:

   - If user hasn't connected Discord yet → Redirected to Discord OAuth
   - If Discord token exists → Check guild membership via Discord API
   - If user is not in the required guild → Access denied (403)
   - If user is in the guild → Access granted (200) with user info headers

4. **Discord OAuth Flow** (when needed):

   - User is redirected to Discord OAuth with required scopes (`identify`, `guilds.members.read`)
   - After authorization, Discord redirects back to `/discord/callback`
   - Service exchanges code for access token and stores it in session
   - User is redirected back to original protected resource

5. **Subsequent requests** → Discord token is validated and guild membership is checked on each auth request

**Note**: This approach doesn't require a Discord bot because it uses OAuth to get permission to read the user's guild memberships directly through Discord's API.

## Security Considerations

1. Always use HTTPS in production
2. Set a strong `SESSION_SECRET`
3. Configure appropriate session cookie settings
4. Ensure Logto application is properly configured
5. **Discord OAuth scopes are minimal** (`identify`, `guilds.members.read`) - only what's needed
6. **Discord tokens are stored in session** and cleared on logout
7. Use environment variables for sensitive configuration

## License

MIT
