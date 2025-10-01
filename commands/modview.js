const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Error handling
const { createValidationError } = require('../utils/errorHandler');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');
const { createSmartUserMention } = require('../utils/utils');

// Data models
const ModerationAction = require('../models/ModerationAction');

// Channel configuration
const channelConfig = require('../config/channels');

class ModviewCommand extends BaseCommand {
  constructor() {
    super(
      new SlashCommandBuilder()
        .setName('modview')
        .setDescription('View the moderation history of a user')
        .addUserOption(option =>
          option.setName('user')
                .setDescription('The user whose moderation history you want to view')
                .setRequired(true)
        )
    );
  }

  // Add an execute method for backward compatibility with V3 command calls
  async execute(interaction) {
    try {
      const validation = await this.validateInput(interaction);
      if (!validation || interaction.replied || interaction.deferred) return;
      await interaction.deferReply();
      const result = await this.executeCommand(interaction);
      if (result.success) {
        await this.sendResponse(interaction, result);
      } else {
        await interaction.editReply({ content: `Error: ${result.error}` });
      }
    } catch (error) {
      // Only log or throw, do not reply here
      console.error('[MODVIEW] Error:', error);
      throw error;
    }
  }

  shouldDeferReply() {
    return false;
  }

  isEphemeral() {
    return false;
  }

  async validateInput(interaction) {
    // Skip permission check for internal calls (when showModview calls this)
    if (!interaction._skipPermissionCheck) {
      if (!await checkModerationPermission(interaction, 'helpers')) {
        throw createValidationError('You do not have permission to view moderation history.');
      }
    }
    
    const targetUser = interaction.options.getUser('user');
    if (!targetUser) {
      throw createValidationError('User is required.');
    }
    return { targetUser };
  }

  async executeCommand(interaction) {
    const { targetUser } = await this.validateInput(interaction);
    
    try {
      // Explicitly use Mongoose's find method
      const history = await ModerationAction.find({ userId: targetUser.id }).sort({ timestamp: -1 });
      console.log(`Found ${history.length} moderation actions for user ${targetUser.tag} (${targetUser.id})`);
      return { targetUser, history, success: true };
    } catch (error) {
      console.error('Error fetching moderation history:', error);
      return { success: false, error: error.message || 'Failed to fetch moderation history' };
    }
  }

  async sendResponse(interaction, result) {
    if (!result.success) {
      return interaction.editReply({ content: `Error: ${result.error}` });
    }
    
    const { targetUser, history } = result;
    
    // If no history, send a simple message
    if (!history || history.length === 0) {
      return interaction.editReply({ content: `${targetUser.tag} has no moderation history.` });
    }

    const itemsPerPage = 3;
    const totalPages = Math.ceil(history.length / itemsPerPage);
    let page = 0;

    const createEmbed = async (page) => {
      // Create smart user mention for target user
      const targetUserMention = await createSmartUserMention(targetUser.id, interaction.client, interaction.guild, { showMemberStatus: true });
      
      const embed = new EmbedBuilder()
        .setTitle(`Moderation History`)
        .setDescription(`👤 **User:** ${targetUserMention} (${targetUser.tag})`)
        .setColor(0xFFAA00)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `Page ${page + 1} of ${totalPages} | User ID: ${targetUser.id}` })
        .setTimestamp();

      const start = page * itemsPerPage;
      const end = Math.min(start + itemsPerPage, history.length);
      
      for (let i = start; i < end; i++) {
        const action = history[i];
        const status = action.active ? 'Active' : 'Inactive';
        const timestamp = Math.floor(new Date(action.timestamp).getTime() / 1000);
        
        // Create smart user mention for moderator
        const moderatorMention = await createSmartUserMention(action.moderatorId, interaction.client, interaction.guild, { showRawId: true });
        
        embed.addFields({
          name: `${action.action.toUpperCase()} [ID: ${action.actionId}]`,
          value: `**Reason:** ${action.reason}\n**Date:** <t:${timestamp}:F>\n**Duration:** ${action.duration || 'N/A'}\n**Status:** ${status}\n**Moderator:** ${moderatorMention}`,
          inline: false
        });
      }
      
      return embed;
    };

    const previousButton = new ButtonBuilder()
      .setCustomId('previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const nextButton = new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(totalPages <= 1);

    const row = new ActionRowBuilder().addComponents(previousButton, nextButton);

    const replyMessage = await interaction.editReply({ 
      embeds: [await createEmbed(page)], 
      components: [row]
    });

    const collector = replyMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: i => i.user.id === interaction.user.id
    });

    collector.on('collect', async i => {
      if (i.customId === 'previous' && page > 0) page--;
      if (i.customId === 'next' && page < totalPages - 1) page++;

      previousButton.setDisabled(page === 0);
      nextButton.setDisabled(page === totalPages - 1);

      await i.update({ embeds: [await createEmbed(page)], components: [row] });
    });

    collector.on('end', () => {
      // Wrap the edit in a try-catch to handle message update failures gracefully
      try {
        replyMessage.edit({ components: [] }).catch(error => {
          console.log('Failed to remove buttons from modview after timeout:', error.message);
        });
      } catch (error) {
        console.log('Error in modview collector end handler:', error.message);
      }
    });
  }
}

module.exports = new ModviewCommand();
