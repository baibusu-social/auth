require('dotenv').config()
const express = require('express')
const session = require('express-session')
const { RedisStore } = require('connect-redis')
const { createClient } = require('redis')
const {
  LogtoExpressConfig,
  handleAuthRoutes,
  withLogto,
} = require('@logto/express')
const DiscordService = require('./discord-service')

const PORT = process.env.PORT || 3000
const discordService = new DiscordService()

// Logto configuration
const config = {
  endpoint:
    process.env.LOGTO_ENDPOINT || 'https://your-logto-endpoint.logto.app',
  appId: process.env.LOGTO_APP_ID || 'your-app-id',
  appSecret: process.env.LOGTO_APP_SECRET || 'your-app-secret',
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
  resources: process.env.LOGTO_RESOURCES
    ? process.env.LOGTO_RESOURCES.split(',')
    : [],
  scopes: process.env.LOGTO_SCOPES
    ? process.env.LOGTO_SCOPES.split(',')
    : ['openid', 'profile'],
}

// Debug logging
console.log('Logto Config:')
console.log('- Endpoint:', config.endpoint)
console.log('- App ID:', config.appId)
console.log('- Base URL:', config.baseUrl)
console.log('- Expected redirect URI:', config.baseUrl + '/logto/callback')

// Initialize session store (Redis or memory)
async function initializeSessionStore() {
  if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    try {
      const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      })

      redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err)
      })

      redisClient.on('connect', () => {
        console.log('Connected to Redis for session storage')
      })

      await redisClient.connect()
      const redisStore = new RedisStore({ client: redisClient })
      console.log('Redis session store initialized successfully')
      return redisStore
    } catch (error) {
      console.warn(
        'Failed to connect to Redis, falling back to memory store:',
        error.message
      )
      return null
    }
  } else {
    console.log('Using memory store for sessions (development mode)')
    return null
  }
}

// Initialize and start the application
async function startApp() {
  const app = express()

  // Initialize session store first
  const sessionStore = await initializeSessionStore()

  console.log('Session store type:', sessionStore ? 'Redis' : 'Memory')

  // Session middleware - now configured with the correct store
  app.use(
    session({
      store: sessionStore, // Will be Redis store in production, memory store in dev
      secret:
        process.env.SESSION_SECRET ||
        'your-session-secret-change-this-in-production',
      resave: false,
      saveUninitialized: false,
      name: 'connect.sid', // Explicit session cookie name
      cookie: {
        secure: false, // Allow HTTP for localhost testing
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax', // More permissive for cross-origin redirects
        domain: undefined, // Don't restrict domain for localhost
      },
    })
  )

  // Add session debugging middleware
  app.use((req, res, next) => {
    console.log('Session ID:', req.sessionID)
    console.log('Session exists:', !!req.session)
    console.log(
      'Session data keys:',
      req.session ? Object.keys(req.session) : 'none'
    )
    next()
  })

  // Serve static files for testing
  app.use(express.static('public'))

  // Add middleware to log all requests to Logto endpoints
  app.use('/logto', (req, res, next) => {
    console.log(`Logto request: ${req.method} ${req.originalUrl}`)
    console.log('Query params:', req.query)
    if (req.originalUrl.includes('sign-in')) {
      console.log('Sign-in request detected - this will redirect to Logto')
    }
    next()
  })

  // Add error handling for Logto routes
  app.use('/logto', (err, req, res, next) => {
    console.error('Logto route error:', err)
    res
      .status(500)
      .json({ error: 'Logto authentication error', details: err.message })
  })

  // Logto auth routes
  app.use(handleAuthRoutes(config))

  // Middleware to handle return URL after successful authentication
  app.use((req, res, next) => {
    // Check if user just authenticated and has a return URL
    if (req.user && req.session.returnTo && req.path === '/') {
      const returnTo = req.session.returnTo
      delete req.session.returnTo
      console.log(`User authenticated, redirecting to: ${returnTo}`)
      return res.redirect(returnTo)
    }
    next()
  })

  // Middleware to check authentication for forward auth
  const requireAuth = withLogto(config, {
    getAccessToken: false,
  })

  // Middleware to check Discord guild membership
  const requireDiscordGuildMembership = async (req, res, next) => {
    if (!discordService.isConfigured()) {
      console.warn('Discord service not configured, skipping guild check')
      return next()
    }

    try {
      const user = req.user
      if (!user) {
        return res.status(401).json({ error: 'User not authenticated' })
      }

      // Check if user has Discord token in session
      const discordToken = req.session.discordAccessToken
      if (!discordToken) {
        // Redirect to Discord OAuth
        const state = Buffer.from(
          JSON.stringify({
            returnTo: req.originalUrl,
            userId: user.sub || user.id,
          })
        ).toString('base64')

        const discordAuthUrl = discordService.getAuthUrl(state)
        return res.status(302).json({
          error: 'Discord verification required',
          redirectTo: discordAuthUrl,
        })
      }

      // Check guild membership
      const membershipCheck = await discordService.checkGuildMembership(
        discordToken
      )
      if (!membershipCheck.isMember) {
        return res.status(403).json({
          error: 'Access denied: Not a member of the required Discord server',
        })
      }

      // Store Discord member info in request
      req.discordMember = membershipCheck.memberData
      next()
    } catch (error) {
      console.error('Discord guild membership check failed:', error)
      // Clear invalid Discord token
      req.session.discordAccessToken = null
      return res.status(500).json({
        error: 'Discord verification failed',
        details: error.message,
      })
    }
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res
      .status(200)
      .json({ status: 'healthy', timestamp: new Date().toISOString() })
  })

  // Debug endpoint to show configuration
  app.get('/debug-config', (req, res) => {
    res.json({
      logtoEndpoint: config.endpoint,
      appId: config.appId,
      baseUrl: config.baseUrl,
      expectedRedirectUri: config.baseUrl + '/logto/callback',
      environment: {
        LOGTO_ENDPOINT: process.env.LOGTO_ENDPOINT,
        LOGTO_APP_ID: process.env.LOGTO_APP_ID,
        BASE_URL: process.env.BASE_URL,
      },
    })
  })

  // Forward auth endpoint for Caddy
  app.get('/auth', requireAuth, requireDiscordGuildMembership, (req, res) => {
    // If we reach here, the user is authenticated and in the Discord guild
    const user = req.user
    const discordMember = req.discordMember

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Set headers for Caddy to use
    res.set({
      'X-Auth-User': user.sub || user.id,
      'X-Auth-Name': user.name || '',
      'X-Auth-Email': user.email || '',
      'X-Auth-Groups': user.groups ? user.groups.join(',') : '',
      'X-Auth-Roles': user.roles ? user.roles.join(',') : '',
      'X-Discord-User': discordMember?.user?.id || '',
      'X-Discord-Username': discordMember?.user?.username || '',
      'X-Discord-Roles': discordMember?.roles
        ? discordMember.roles.join(',')
        : '',
    })

    // Return success status for Caddy
    res.status(200).json({
      authenticated: true,
      discordVerified: true,
      user: {
        id: user.sub || user.id,
        name: user.name,
        email: user.email,
        groups: user.groups || [],
        roles: user.roles || [],
      },
      discord: {
        id: discordMember?.user?.id,
        username: discordMember?.user?.username,
        roles: discordMember?.roles || [],
      },
    })
  })

  // Forward auth endpoint that only returns status (for Caddy forward_auth)
  app.get('/auth/verify', (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      // Get the original URL from Caddy headers
      const originalUrl =
        req.get('X-Forwarded-Uri') || req.get('X-Original-URL') || '/'
      const originalHost = req.get('X-Forwarded-Host') || req.get('Host')
      const protocol = req.get('X-Forwarded-Proto') || 'https'

      // Build the return URL
      const returnTo = `${protocol}://${originalHost}${originalUrl}`

      // Redirect to sign-in with return URL
      const signInUrl = `${
        config.baseUrl
      }/sign-in?returnTo=${encodeURIComponent(returnTo)}`

      console.log(`Auth verify failed, redirecting to: ${signInUrl}`)
      console.log(`Return URL will be: ${returnTo}`)

      return res.status(401).set('Location', signInUrl).end()
    }

    // Continue with auth and Discord checks
    requireAuth(req, res, (err) => {
      if (err) return next(err)

      requireDiscordGuildMembership(req, res, (err) => {
        if (err) return next(err)

        const user = req.user
        const discordMember = req.discordMember

        // Set headers for Caddy to forward
        res.set({
          'X-Auth-User': user.sub || user.id,
          'X-Auth-Name': user.name || '',
          'X-Auth-Email': user.email || '',
          'X-Auth-Groups': user.groups ? user.groups.join(',') : '',
          'X-Auth-Roles': user.roles ? user.roles.join(',') : '',
          'X-Discord-User': discordMember?.user?.id || '',
          'X-Discord-Username': discordMember?.user?.username || '',
          'X-Discord-Roles': discordMember?.roles
            ? discordMember.roles.join(',')
            : '',
        })

        // Return 200 OK for successful authentication
        res.status(200).end()
      })
    })
  })

  // Login route (redirect to Logto)
  app.get('/login', (req, res) => {
    res.redirect('/logto/sign-in')
  })

  // Sign-in route with return URL support (for Caddy forward_auth)
  app.get('/sign-in', (req, res) => {
    const returnTo = req.query.returnTo
    if (returnTo) {
      // Store the return URL in session for after authentication
      req.session.returnTo = returnTo
      console.log(`Storing return URL in session: ${returnTo}`)
    }
    res.redirect('/logto/sign-in')
  })

  // Discord OAuth callback
  app.get('/discord/callback', async (req, res) => {
    try {
      const { code, state } = req.query

      if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' })
      }

      // Exchange code for token
      const tokenData = await discordService.exchangeCodeForToken(code)

      // Store Discord access token in session
      req.session.discordAccessToken = tokenData.access_token

      // Parse state to get return URL
      let returnTo = '/profile'
      if (state) {
        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
          returnTo = stateData.returnTo || '/profile'
        } catch (e) {
          console.warn('Failed to parse state:', e.message)
        }
      }

      res.redirect(returnTo)
    } catch (error) {
      console.error('Discord OAuth callback error:', error)
      res.status(500).json({
        error: 'Discord authentication failed',
        details: error.message,
      })
    }
  })

  // Logout route
  app.get('/logout', (req, res) => {
    // Clear Discord token from session
    req.session.discordAccessToken = null
    res.redirect('/logto/sign-out')
  })

  // Clear all cookies and session data (for debugging domain issues)
  app.get('/clear', (req, res) => {
    console.log('Clearing all session data and cookies')

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err)
      }
    })

    // Clear all cookies by setting them to expire
    const cookieNames = ['connect.sid', 'session']
    cookieNames.forEach((name) => {
      try {
        res.clearCookie(name, {
          path: '/',
          domain: undefined, // Clear for all domains
          httpOnly: true,
          secure: false, // Allow clearing over http for localhost
        })
        // Also try clearing with different options
        res.clearCookie(name, { path: '/' })
        res.clearCookie(name)
      } catch (error) {
        console.warn(`Failed to clear cookie ${name}:`, error.message)
      }
    })

    res.json({
      message: 'All sessions and cookies cleared',
      instructions: 'Now try accessing /auth again',
      timestamp: new Date().toISOString(),
    })
  })

  // Profile route (optional, for testing)
  app.get('/profile', requireAuth, async (req, res) => {
    const user = req.user
    let discordInfo = null
    let guildMembership = null

    // Get Discord info if token is available
    if (req.session.discordAccessToken && discordService.isConfigured()) {
      try {
        discordInfo = await discordService.getUser(
          req.session.discordAccessToken
        )
        guildMembership = await discordService.checkGuildMembership(
          req.session.discordAccessToken
        )
      } catch (error) {
        console.error('Error fetching Discord info:', error.message)
        // Clear invalid token
        req.session.discordAccessToken = null
      }
    }

    res.json({
      user: req.user,
      isAuthenticated: req.user ? true : false,
      discord: {
        connected: !!discordInfo,
        user: discordInfo,
        guildMember: guildMembership?.isMember,
        memberData: guildMembership?.memberData,
        authUrl: discordService.isConfigured()
          ? discordService.getAuthUrl('profile')
          : null,
      },
    })
  })

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('Error:', err)
    res.status(500).json({ error: 'Internal server error' })
  })

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Start server
  app.listen(PORT, () => {
    console.log(`Auth forwarder server running on port ${PORT}`)
    console.log(`Health check: http://localhost:${PORT}/health`)
    console.log(`Auth endpoint: http://localhost:${PORT}/auth`)
    console.log(`Auth verify endpoint: http://localhost:${PORT}/auth/verify`)
  })

  return app
}

// Start the application
startApp().catch((error) => {
  console.error('Failed to start application:', error)
  process.exit(1)
})

module.exports = { startApp }
