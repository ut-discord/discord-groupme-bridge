# discord-groupme-bridge

## This project is a fork of [groupme-discord-bridge](https://github.com/alejzeis/groupme-discord-bridge) 

A bridge bot which connects a GroupMe chat and a Discord Channel. It's designed to be ran on a server so it is completely command-line only. You can run it on your home computer but it is not recommended, as you need to open your firewall up so GroupMe can send messages to the bridge.

**SECURITY NOTICE:** Theoretically someone COULD intercept messages from GroupMe to the bridge if you do not run behind a reverse proxy, which isn't covered here. That is because the bridge uses a plain HTTP server to recieve data from GroupMe. If you want messages to be secure, it is recommended to run the bridge behind a reverse proxy such as [nginx](https://www.nginx.com/), as your forward web server would have HTTPS enabled, and all requests would go to it, which it would then send over the local network to the bridge.

## Requirements
- NodeJS installed.
- Your firewall opened for a port so GroupMe can send the bridge messages **OR** a forward facing web server like Nginx or Apache that you can configure a reverse proxy for.

### Limitations
The program can only bridge pairs of GroupMe Groups and a single Discord Channel together. 

## Setting up
TODO: UPdate for new changes made