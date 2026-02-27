const reportSystem = require('../utils/reportSystem');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class ReportCommands {
    constructor() {
        this.reportSystem = reportSystem;
    }

    async report(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        const userMention = args[0];
        const reason = args.slice(1).join(' ');

        if (!userMention || !reason) {
            return message.reply('Usage: `!report @user <reason>`');
        }

        const userId = userMention.replace(/[<@!>]/g, '');
        
        if (userId === message.author.id) {
            return message.reply('You cannot report yourself.');
        }

        try {
            const report = await this.reportSystem.createReport(
                message.author.id,
                userId,
                reason,
                message.guild.id,
                false
            );

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('Report Submitted')
                .setDescription(`Your report has been submitted successfully.`)
                .addFields(
                    { name: 'Report ID', value: report.id.substring(0, 8) },
                    { name: 'Reported User', value: `<@${userId}>` },
                    { name: 'Reason', value: reason },
                    { name: 'Status', value: 'Pending Review' }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            const notificationChannel = message.guild.channels.cache.find(
                c => c.name === 'mod-reports' || c.name === 'reports'
            );
            if (notificationChannel) {
                const modEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('New Report')
                    .setDescription(`A new report has been submitted.`)
                    .addFields(
                        { name: 'Report ID', value: report.id.substring(0, 8) },
                        { name: 'Reporter', value: message.author.tag },
                        { name: 'Reported User', value: `<@${userId}>` },
                        { name: 'Reason', value: reason },
                        { name: 'Priority', value: report.priority }
                    )
                    .setTimestamp();

                await notificationChannel.send({ embeds: [modEmbed] });
            }

        } catch (error) {
            console.error('Report error:', error);
            await message.reply('An error occurred while submitting your report.');
        }
    }

    async reports(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        const status = args[0];
        let filterOptions = {};

        if (status && ['pending', 'resolved', 'dismissed'].includes(status)) {
            filterOptions.status = status;
        }

        try {
            const reports = await this.reportSystem.getReports(message.guild.id, {
                ...filterOptions,
                limit: 10
            });

            if (reports.length === 0) {
                return message.reply('No reports found.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Reports')
                .setDescription(`Found ${reports.length} report(s)`);

            reports.forEach((report, index) => {
                const reporter = report.reporterAnonymous ? 'Anonymous' : `<@${report.reporterId}>`;
                embed.addFields({
                    name: `Report #${index + 1} (${report.id.substring(0, 8)})`,
                    value: `**Reported:** <@${report.reportedUserId}>\n**Reason:** ${report.reason}\n**Reporter:** ${reporter}\n**Status:** ${report.status}\n**Priority:** ${report.priority}\n**Created:** ${new Date(report.createdAt).toLocaleString()}`
                });
            });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('List reports error:', error);
            await message.reply('An error occurred while fetching reports.');
        }
    }

    async resolveReport(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need Manage Messages permission to resolve reports.');
        }

        const reportId = args[0];
        const resolution = args[1];
        const note = args.slice(2).join(' ');

        if (!reportId || !resolution) {
            return message.reply('Usage: `!report resolve <id> <resolved|dismissed> [note]`');
        }

        if (!['resolved', 'dismissed'].includes(resolution)) {
            return message.reply('Resolution must be "resolved" or "dismissed".');
        }

        try {
            const report = await this.reportSystem.resolveReport(
                reportId,
                message.author.id,
                resolution,
                note
            );

            const embed = new EmbedBuilder()
                .setColor(resolution === 'resolved' ? 0x00FF00 : 0xFFFF00)
                .setTitle('Report Resolved')
                .addFields(
                    { name: 'Report ID', value: report.id.substring(0, 8) },
                    { name: 'Resolution', value: resolution },
                    { name: 'Moderator', value: message.author.tag },
                    { name: 'Note', value: note || 'No note provided' }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            const reporter = await client.users.fetch(report.reporterId);
            if (reporter && !report.reporterAnonymous) {
                const notifyEmbed = new EmbedBuilder()
                    .setColor(resolution === 'resolved' ? 0x00FF00 : 0xFFFF00)
                    .setTitle('Report Update')
                    .setDescription(`Your report has been ${resolution}.`)
                    .addFields(
                        { name: 'Report ID', value: report.id.substring(0, 8) },
                        { name: 'Note', value: note || 'No additional information' }
                    )
                    .setTimestamp();

                try {
                    await reporter.send({ embeds: [notifyEmbed] });
                } catch (e) {
                    console.log('Could not DM reporter:', e.message);
                }
            }

        } catch (error) {
            if (error.message === 'Report not found') {
                return message.reply('Report not found.');
            }
            console.error('Resolve report error:', error);
            await message.reply('An error occurred while resolving the report.');
        }
    }

    async appeal(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        const guild = message.guild;
        const member = message.member;

        const banStatus = await this.checkBanStatus(guild, member);
        const muteStatus = await this.checkMuteStatus(member);

        if (!banStatus && !muteStatus) {
            return message.reply('You are not currently banned or muted.');
        }

        const appealType = banStatus ? 'ban' : 'mute';
        const punishmentId = banStatus || muteStatus;
        const reason = args.join(' ');

        if (!reason) {
            return message.reply(`Usage: \`!appeal <reason>\`\n\nPlease explain why your ${appealType} should be lifted.`);
        }

        try {
            const existingPending = await this.reportSystem.getAppeals(message.guild.id, {
                userId: message.author.id,
                status: 'pending'
            });

            const typeFilter = existingPending.filter(a => a.type === appealType);
            if (typeFilter.length > 0) {
                return message.reply(`You already have a pending ${appealType} appeal.`);
            }

            const appeal = await this.reportSystem.createAppeal(
                message.author.id,
                appealType,
                punishmentId,
                reason,
                message.guild.id
            );

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`${appealType.charAt(0).toUpperCase() + appealType.slice(1)} Appeal Submitted`)
                .setDescription(`Your ${appealType} appeal has been submitted for review.`)
                .addFields(
                    { name: 'Appeal ID', value: appeal.id.substring(0, 8) },
                    { name: 'Reason', value: reason },
                    { name: 'Status', value: 'Pending Review' }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            const modChannel = guild.channels.cache.find(
                c => c.name === 'mod-reports' || c.name === 'appeals' || c.name === 'mod-log'
            );
            if (modChannel) {
                const modEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`New ${appealType.charAt(0).toUpperCase() + appealType.slice(1)} Appeal`)
                    .addFields(
                        { name: 'User', value: `${message.author.tag} (${message.author.id})` },
                        { name: 'Appeal ID', value: appeal.id.substring(0, 8) },
                        { name: 'Reason', value: reason },
                        { name: 'Previous Appeals', value: appeal.previousAppeals.length.toString() }
                    )
                    .setTimestamp();

                await modChannel.send({ embeds: [modEmbed] });
            }

        } catch (error) {
            console.error('Appeal error:', error);
            await message.reply('An error occurred while submitting your appeal.');
        }
    }

    async checkBanStatus(guild, member) {
        try {
            const ban = await guild.bans.fetch(member.id);
            return ban ? member.id : null;
        } catch {
            return null;
        }
    }

    async checkMuteStatus(member) {
        const muteRole = member.guild.roles.cache.find(r => r.name === 'Muted');
        if (!muteRole) return null;
        return member.roles.cache.has(muteRole.id) ? member.id : null;
    }

    async appeals(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need Manage Messages permission to view appeals.');
        }

        const status = args[0];
        let filterOptions = {};

        if (status && ['pending', 'approved', 'denied'].includes(status)) {
            filterOptions.status = status;
        }

        try {
            const appeals = await this.reportSystem.getAppeals(message.guild.id, {
                ...filterOptions,
                limit: 10
            });

            if (appeals.length === 0) {
                return message.reply('No appeals found.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Appeals')
                .setDescription(`Found ${appeals.length} appeal(s)`);

            for (const appeal of appeals) {
                embed.addFields({
                    name: `Appeal #${appeal.id.substring(0, 8)} (${appeal.type})`,
                    value: `**User:** <@${appeal.userId}>\n**Reason:** ${appeal.reason}\n**Status:** ${appeal.status}\n**Previous Appeals:** ${appeal.previousAppeals.length}\n**Created:** ${new Date(appeal.createdAt).toLocaleString()}`
                });
            }

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('List appeals error:', error);
            await message.reply('An error occurred while fetching appeals.');
        }
    }

    async reviewAppeal(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need Manage Messages permission to review appeals.');
        }

        const decision = args[0];
        const appealId = args[1];
        const note = args.slice(2).join(' ');

        if (!decision || !appealId) {
            return message.reply('Usage: `!appeal approve|deny <id> [note]`');
        }

        if (!['approve', 'deny'].includes(decision)) {
            return message.reply('Decision must be "approve" or "deny".');
        }

        try {
            const appeal = await this.reportSystem.reviewAppeal(
                appealId,
                message.author.id,
                decision === 'approve' ? 'approved' : 'denied',
                note
            );

            const embed = new EmbedBuilder()
                .setColor(decision === 'approve' ? 0x00FF00 : 0xFF0000)
                .setTitle(`Appeal ${decision === 'approve' ? 'Approved' : 'Denied'}`)
                .addFields(
                    { name: 'Appeal ID', value: appeal.id.substring(0, 8) },
                    { name: 'User', value: `<@${appeal.userId}>` },
                    { name: 'Moderator', value: message.author.tag },
                    { name: 'Note', value: note || 'No note provided' }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            try {
                const user = await client.users.fetch(appeal.userId);
                const userEmbed = new EmbedBuilder()
                    .setColor(decision === 'approve' ? 0x00FF00 : 0xFF0000)
                    .setTitle(`Your ${appeal.type} appeal has been ${decision === 'approve' ? 'approved' : 'denied'}`)
                    .addFields(
                        { name: 'Decision', value: decision === 'approve' ? 'Approved' : 'Denied' },
                        { name: 'Reviewer Note', value: note || 'No additional information' }
                    )
                    .setTimestamp();

                await user.send({ embeds: [userEmbed] });

                if (decision === 'approve') {
                    if (appeal.type === 'ban') {
                        await message.guild.members.unban(appeal.userId, 'Appeal approved');
                    } else if (appeal.type === 'mute') {
                        const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
                        if (muteRole) {
                            const member = await message.guild.members.fetch(appeal.userId);
                            if (member) {
                                await member.roles.remove(muteRole, 'Appeal approved');
                            }
                        }
                    }
                }
            } catch (e) {
                console.log('Could not notify user or apply punishment change:', e.message);
            }

        } catch (error) {
            if (error.message === 'Appeal not found') {
                return message.reply('Appeal not found.');
            }
            console.error('Review appeal error:', error);
            await message.reply('An error occurred while reviewing the appeal.');
        }
    }

    async getStats(client, message, args) {
        if (!message.guild) {
            return message.reply('This command can only be used in a server.');
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('You need Manage Messages permission to view statistics.');
        }

        try {
            const [reportStats, appealStats] = await Promise.all([
                this.reportSystem.getReportStats(message.guild.id),
                this.reportSystem.getAppealStats(message.guild.id)
            ]);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Moderation Statistics')
                .setTimestamp();

            embed.addFields({ name: 'Reports', value: '━'.repeat(20) });
            embed.addFields(
                { name: 'Total Reports', value: reportStats.total.toString(), inline: true },
                { name: 'Pending', value: reportStats.pending.toString(), inline: true },
                { name: 'Resolved', value: reportStats.resolved.toString(), inline: true },
                { name: 'Dismissed', value: reportStats.dismissed.toString(), inline: true },
                { name: 'High Priority', value: reportStats.byPriority.high.toString(), inline: true },
                { name: 'Medium Priority', value: reportStats.byPriority.medium.toString(), inline: true },
                { name: 'Low Priority', value: reportStats.byPriority.low.toString(), inline: true }
            );

            embed.addFields({ name: '\nAppeals', value: '━'.repeat(20) });
            embed.addFields(
                { name: 'Total Appeals', value: appealStats.total.toString(), inline: true },
                { name: 'Pending', value: appealStats.pending.toString(), inline: true },
                { name: 'Approved', value: appealStats.approved.toString(), inline: true },
                { name: 'Denied', value: appealStats.denied.toString(), inline: true },
                { name: 'Ban Appeals', value: appealStats.byType.ban.toString(), inline: true },
                { name: 'Mute Appeals', value: appealStats.byType.mute.toString(), inline: true }
            );

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Stats error:', error);
            await message.reply('An error occurred while fetching statistics.');
        }
    }
}

module.exports = new ReportCommands();
