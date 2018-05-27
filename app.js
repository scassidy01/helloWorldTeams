var restify = require('restify');
var builder = require('botbuilder');
const githubClient = require('./github-client');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
const bot = new builder.UniversalBot(connector)
    .set('storage', new builder.MemoryBotStorage());

const dialog = new builder.IntentDialog();

// User sends *Search* command and we respond with Asking the user who they are looking to search for
dialog.matches(/^search/i, [
    function (session, args, next) {
        if (session.message.text.toLowerCase() === 'search'){
            builder.Prompts.text(session, 'Who are you looking for?');
        } else {
            // If user sends search NAME then we ignore the above prompt
            var query = session.message.text.substring(7);
            // Send username to git API
            next ({response: query});
        }
    },
    function (session, result, next) {
        var query = result.response;
        if (!query) {
            session.endDialog('Request Cancelled');
        } else {
            githubClient.executeSearch(query, function (profiles) {
                //get JSON data structure and provide rudimentary filtering based on search term
                var totalCount = profiles.total_count;
                if (totalCount === 0) {
                    session.endDialog('Sorry, no results found.');
                } else if (totalCount > 10) {
                    session.endDialog('More thand 10 results were found. Try a different search term');
                } else {
                    // provide options for the user to pick from based on the returned results from the gitHub API
                    session.dialogData.property = null;
                    var username = profiles.items.map(function(item){ return item.login});
                    builder.Prompts.choice(session,'Choose a user would you like to view.', username);
                }

            });
        }
    },
    function (session, result, next) {
        var username = result.response.entity;
        githubClient.loadProfile(username, function (profile){
            var card = new builder.ThumbnailCard(session);
            card.title(profile.login);
            card.images([builder.CardImage.create(session, profile.avatar_url)]);
            if (profile.name) card.subtitle(profile.name);

            var text = '';
            if (profile.company) text += profile.company + ' \n';
            if (profile.email) text += profile.email + ' \n';
            if (profile.bio) text += profile.bio;
            card.text(text);

            card.tap(new builder.CardAction.openUrl(session, profile.html_url));

            var message = new builder.Message(session).attachments([card]);
            session.send(message);
        });
    }
]);

bot.dialog('/', dialog);
