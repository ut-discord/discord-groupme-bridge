// Imports -----------------------------------------------------------------------------------------------------------------
const Discord = require("discord.js");
const { Client, IntentsBitField, Partials, WebhookClient } = require('discord.js');
const YAML = require("yamljs");
const request = require("request-promise");
const express = require("express");
const bodyParser = require("body-parser");
const uuidv1 = require("uuid/v1");

const os = require("os");
const fs = require("fs");
const path = require("path");
const process = require("process");

// Config and functions -----------------------------------------------------------------------------------------------------------------
const defaultConfig = {
    listenPort: 80,
    callbackURL: "/callback",
    discord: {
        token: "",
        guild: "0"
    },
    groupme: {
        accessToken: ""
    },
    links: [
        {
            discord: {
                channel: "0"
            },
            groupme: {
                name: "",
                botId: ""
            }
        }
    ]
};


var config;
var tempDir = path.join(os.tmpdir(), "groupme-discord-bridge");

function download(url, filename, callback) {
    request.head(url, (err, res, body) => {
        let downloadedLocation = path.join(tempDir, filename)
        let contentType = res.headers['content-type'];

        request(url).pipe(fs.createWriteStream(downloadedLocation)).on('close', () => callback(contentType, downloadedLocation));
    });
}

function sendGroupMeMessage(message, attachments, callback, botId) {
    let options = {
        method: 'POST',
        uri: 'https://api.groupme.com/v3/bots/post',
        body: {
            bot_id: botId,
            text: message
        },
        json: true
    };

    if(attachments != null) {
        options.body.attachments = attachments;
    }

    request(options).then((res) => {
        callback(res);
    }).catch((err) => {
        console.error(err);
    });
}


function getGroupMeBots() {
    let options = {
        method: 'GET',
        uri: 'https://api.groupme.com/v3/bots',
        headers: {
            "X-Access-Token": config.groupme.accessToken
        },
        json: true
    };

    request(options).then((res) => {
        let bots = res.response;
        for(let i = 0; i < bots.length; i++) {
            let link = config.links.findIndex(x => x.groupme.botId === bots[i].bot_id);
            if(link < 0) continue;
            
            config.links[link].groupme.groupId = bots[i].group_id;
            config.links[link].groupme.name = bots[i].name;
        }
    }).catch((err) => {
        console.error(err);
    });
}

function sendDiscordMessage(message, sender, avatar_url, link, attachments) {
    link.discord.webhook.send({
        content: message,
        username: sender,
        avatarURL: avatar_url,
    });
}

// Program Main ----------------------------------------------------------------------------------------------------------------------------


try {
    fs.mkdirSync(tempDir);
} catch(e) {
    // Already exists
}

try {
    config = YAML.load("bridgeBot.yml");
} catch(e) {
    console.error("Could not load bridgeBot.yml, perhaps it doesn't exist? Creating it...");
    fs.writeFileSync("bridgeBot.yml", YAML.stringify(defaultConfig, 4));
    console.error("Configuration file created. Please fill out the fields and then run the bot again.")
    process.exit(1);
}

getGroupMeBots();

const myIntents = new IntentsBitField([IntentsBitField.Flags.Guilds, IntentsBitField.Flags.DirectMessages, IntentsBitField.Flags.GuildPresences, IntentsBitField.Flags.GuildMembers, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent]);
const discordClient = new Discord.Client(
    {
         intents: myIntents,
         partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });

const expressApp = express();
expressApp.use(bodyParser.json());
var discordGuild;


discordClient.on("ready", () => {
    console.log("Discord Client Ready.");
    discordGuild = discordClient.guilds.cache.get(config.discord.guild);
});


discordClient.once('ready', async () => {
    for(let i = 0; i < config.links.length; i++) {
        const channel = discordClient.channels.cache.get(config.links[i].discord.channel);
        try {
            let webhooks = await channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.token);

            if (!webhook) {
                console.log("Creating webhook for channel #"+channel.name);
                await channel.createWebhook({
                    name: 'discord-groupme-bridge'
                })
                webhooks = await channel.fetchWebhooks();
                webhook = webhooks.find(wh => wh.token);
            }

            config.links[i].discord.webhook = webhook;

        } catch (error) {
            console.error('Error fetching webhooks');
        }
    }
});


discordClient.on("messageCreate", async (message) => {
    if(message.webhookId) return;
    if((message.content == null || message.content == "") && message.attachments.size == 0) return;

    let link = config.links.find(x => x.discord.channel === message.channelId);
    if(!link) return;

    let author = message.member.nickname == null ? message.author.username : message.member.nickname;

    if(message.attachments.size > 0) {
        // First download the image
        let attachment = message.attachments.values().next().value;
        download(attachment.url, attachment.filename, (mimetype, downloadedLocation) => {
            let options = {
                method: 'POST',
                url: "https://image.groupme.com/pictures",
                headers: {
                    "X-Access-Token": config.groupme.accessToken
                },
                formData: {
                    file: fs.createReadStream(downloadedLocation)
                }
            };
            let req = request(options).then((res) => {
                sendGroupMeMessage(author + " sent an image:", [ { type: "image", url: JSON.parse(res).payload.url } ], (response) => {
                    console.log(response);
                });
            }).catch((err) => {
                console.error(err);
            });
        });
    } else {
        sendGroupMeMessage(author + ": " + message.cleanContent, null, () => {}, link.groupme.botId);
    }
});

expressApp.post(config.callbackURL, (req, res) => {
    let link = config.links.find(x => x.groupme.groupId === req.body.group_id);;
    if(!link) return;
    if(req.body.name == link.groupme.name) return;

    var text = req.body.text;
    var sender = req.body.name;
    var attachments = req.body.attachments;

	if (attachments.length > 0) {
		let image = false;
		switch (attachments[0].type) {
			case "image":
				image = true;
			case "video":
				let array = attachments[0].url.split(".");
				let filename = uuidv1() + "." + array[array.length - 2];
				download(attachments[0].url, uuidv1(), (mimetype, downloadedLocation) => {
					fs.stat(downloadedLocation, (err, stats) => {
						if (err) {
							console.error(err);
							return;
						}

						// Discord does not allow files greater than 8MB unless user has Nitro
						if (stats.size > (1024 * 1024 * 8)) {
							discordChannel.send("**" + sender + "** ***Sent " + (image ? "an image" : "a video") + ":*** " + attachments[0].url).then(() => fs.unlink(downloadedLocation));
						} else {
							discordChannel.send("**" + sender + "**: " + text).then(() => {
								discordChannel.send("**" + sender + "** ***Sent " + (image ? "an image" : "a video") + ":***", new Discord.Attachment(downloadedLocation, filename)).then(() => fs.unlink(downloadedLocation));
							});
						}
					});
				});
				break;
            case "reply":
                // TODO: Handle replies
                break;
			default:
				console.log("Unknown attachment: " + attachments[0].type);
		}
    } else {
      sendDiscordMessage(text, sender, req.body.avatar_url, link);
    }
});



discordClient.login(config.discord.token);
expressApp.listen(config.listenPort, () => console.log('Express now listening for requests'));
