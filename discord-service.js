const axios = require('axios')

class DiscordService {
  constructor() {
    this.clientId = process.env.DISCORD_CLIENT_ID
    this.clientSecret = process.env.DISCORD_CLIENT_SECRET
    this.guildId = process.env.DISCORD_GUILD_ID
    this.redirectUri = process.env.DISCORD_REDIRECT_URI
    this.baseUrl = 'https://discord.com/api/v10'
  }

  /**
   * Generate Discord OAuth URL
   */
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds.members.read',
      state: state || 'default',
    })

    return `https://discord.com/oauth2/authorize?${params.toString()}`
  }

  /**
   * Exchange code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth2/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      return response.data
    } catch (error) {
      console.error(
        'Error exchanging code for token:',
        error.response?.data || error.message
      )
      throw new Error('Failed to exchange code for token')
    }
  }

  /**
   * Get user information from Discord
   */
  async getUser(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/users/@me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      return response.data
    } catch (error) {
      console.error(
        'Error getting user info:',
        error.response?.data || error.message
      )
      throw new Error('Failed to get user information')
    }
  }

  /**
   * Check if user is a member of the specified guild
   */
  async checkGuildMembership(accessToken, userId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/users/@me/guilds/${this.guildId}/member`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      return {
        isMember: true,
        memberData: response.data,
      }
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          isMember: false,
          memberData: null,
        }
      }

      console.error(
        'Error checking guild membership:',
        error.response?.data || error.message
      )
      throw new Error('Failed to check guild membership')
    }
  }

  /**
   * Get user's guild member information (roles, etc.)
   */
  async getGuildMemberInfo(accessToken) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/users/@me/guilds/${this.guildId}/member`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      return response.data
    } catch (error) {
      console.error(
        'Error getting guild member info:',
        error.response?.data || error.message
      )
      return null
    }
  }

  /**
   * Validate that all required Discord configuration is present
   */
  isConfigured() {
    return !!(
      this.clientId &&
      this.clientSecret &&
      this.guildId &&
      this.redirectUri
    )
  }
}

module.exports = DiscordService
