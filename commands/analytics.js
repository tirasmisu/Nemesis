const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { checkPermissions } = require('../utils/commandHelpers');
const analytics = require('../utils/analytics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('View comprehensive server analytics and engagement statistics')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of analytics to view')
                .addChoices(
                    { name: 'Overview', value: 'overview' },
                    { name: 'Commands', value: 'commands' },
                    { name: 'Channels', value: 'channels' },
                    { name: 'Growth', value: 'growth' },
                    { name: 'Engagement', value: 'engagement' }
                )
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
};

async function createOverviewEmbed() {
    const summary = analytics.getAnalyticsSummary();
    
    const embed = new EmbedBuilder()
        .setColor('#00ff88')
        .setTitle('📊 Server Analytics - Overview')
        .addFields(
            { name: '⏱️ Bot Uptime', value: summary.uptime.formatted, inline: true },
            { name: '💬 Messages Today', value: summary.today.messages.toLocaleString(), inline: true },
            { name: '⚡ Commands Today', value: summary.today.commands.toLocaleString(), inline: true },
            { name: '👥 New Members Today', value: summary.today.newMembers.toLocaleString(), inline: true },
            { name: '🟢 Active Users Today', value: summary.today.activeUsers.toLocaleString(), inline: true },
            { name: '📈 Messages/Hour', value: Math.round(summary.today.messages / summary.uptime.hours).toLocaleString(), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /analytics commands to see command usage statistics' });

    // Add weekly comparison if available
    if (summary.week) {
        embed.addFields(
            { name: '📅 This Week', value: `**Messages:** ${summary.week.messages.toLocaleString()}\n**Commands:** ${summary.week.commands.toLocaleString()}\n**New Members:** ${summary.week.newMembers.toLocaleString()}`, inline: false }
        );
    }

    return embed;
}

async function createCommandsEmbed() {
    const summary = analytics.getAnalyticsSummary();
    
    let commandsText = '';
    if (summary.topCommands && summary.topCommands.length > 0) {
        summary.topCommands.forEach((cmd, index) => {
            const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊';
            commandsText += `${emoji} **${cmd.command}**: ${cmd.uses} uses (${cmd.successRate} success)\n`;
        });
    } else {
        commandsText = 'No command data available yet.';
    }

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('⚡ Command Usage Analytics')
        .addFields(
            { name: '📊 Top Commands Today', value: commandsText, inline: false },
            { name: '📈 Command Statistics', value: `**Total Commands:** ${summary.today.commands.toLocaleString()}\n**Commands/Hour:** ${Math.round(summary.today.commands / summary.uptime.hours)}\n**Active Command Types:** ${summary.topCommands.length}`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Command success rates help identify issues' });

    return embed;
}

async function createChannelsEmbed() {
    const summary = analytics.getAnalyticsSummary();
    
    let channelsText = '';
    if (summary.popularChannels && summary.popularChannels.length > 0) {
        summary.popularChannels.forEach((channel, index) => {
            const emoji = index === 0 ? '🔥' : index === 1 ? '⭐' : index === 2 ? '✨' : '📝';
            channelsText += `${emoji} <#${channel.channelId}>: ${channel.messages} messages (${channel.percentage})\n`;
        });
    } else {
        channelsText = 'No channel activity data available yet.';
    }

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('📺 Channel Activity Analytics')
        .addFields(
            { name: '🔥 Most Active Channels Today', value: channelsText, inline: false },
            { name: '📊 Channel Statistics', value: `**Total Messages:** ${summary.today.messages.toLocaleString()}\n**Average per Channel:** ${Math.round(summary.today.messages / summary.popularChannels.length) || 0}\n**Tracked Channels:** ${summary.popularChannels.length}`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Channel data helps optimize content strategy' });

    return embed;
}

async function createGrowthEmbed() {
    const summary = analytics.getAnalyticsSummary();
    
    // Calculate growth metrics
    const dailyGrowthRate = summary.today.newMembers;
    const weeklyProjection = dailyGrowthRate * 7;
    const monthlyProjection = dailyGrowthRate * 30;
    
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('📈 Server Growth Analytics')
        .addFields(
            { name: '👥 Growth Today', value: `**New Members:** ${summary.today.newMembers}\n**Growth Rate:** ${dailyGrowthRate} members/day`, inline: true },
            { name: '📊 Projections', value: `**Weekly:** ~${weeklyProjection} members\n**Monthly:** ~${monthlyProjection} members`, inline: true },
            { name: '📈 Engagement Growth', value: `**Active Users:** ${summary.today.activeUsers}\n**Engagement Rate:** ${((summary.today.activeUsers / Math.max(summary.today.newMembers, 1)) * 100).toFixed(1)}%`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Growth projections based on current daily rate' });

    // Add weekly data if available
    if (summary.week) {
        embed.addFields(
            { name: '📅 Weekly Summary', value: `**New Members:** ${summary.week.newMembers}\n**Total Messages:** ${summary.week.messages.toLocaleString()}\n**Total Commands:** ${summary.week.commands.toLocaleString()}`, inline: false }
        );
    }

    return embed;
}

async function createEngagementEmbed() {
    const summary = analytics.getAnalyticsSummary();
    
    // Calculate engagement metrics
    const messagesPerUser = summary.today.activeUsers > 0 ? 
        Math.round(summary.today.messages / summary.today.activeUsers) : 0;
    const commandsPerUser = summary.today.activeUsers > 0 ? 
        Math.round(summary.today.commands / summary.today.activeUsers) : 0;
    
    // Peak hours info
    let peakHoursText = 'No peak hour data available yet.';
    if (summary.peakHours && summary.peakHours.length > 0) {
        peakHoursText = summary.peakHours.map((hour, index) => 
            `${index + 1}. ${hour.formatted} (${hour.activity} messages)`
        ).join('\n');
    }
    
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🎯 User Engagement Analytics')
        .addFields(
            { name: '👥 Engagement Metrics', value: `**Active Users:** ${summary.today.activeUsers}\n**Messages/User:** ${messagesPerUser}\n**Commands/User:** ${commandsPerUser}`, inline: true },
            { name: '⏰ Peak Activity Hours', value: peakHoursText, inline: true },
            { name: '📊 Activity Distribution', value: `**Messages:** ${summary.today.messages.toLocaleString()}\n**Commands:** ${summary.today.commands.toLocaleString()}\n**Ratio:** ${Math.round((summary.today.commands / Math.max(summary.today.messages, 1)) * 100)}% commands`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'Engagement data helps schedule events and content' });

    return embed;
} 
