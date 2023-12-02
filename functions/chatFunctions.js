/* eslint-disable max-len */
const {app} = require("./firebase-init");
const functions = require("firebase-functions");
const uuid = require("uuid");
const environment = require("./environement");
const firestore = app.firestore();

exports.onchatUpdate = functions.firestore.document("chat/{chatId}").onUpdate(
    (snapshot)=>{
      const latestData = snapshot.after.data();
      // console.log(latestData);
      const messages = latestData.messages;
      // console.log(messages);
      if (messages.length > 0) {
        const today = new Date();
        const todayStart = today.setHours(0, 0, 0, 0);
        const todayEnd = today.setHours(23, 59, 59, 999);
        const todayMessages = messages.filter(
            (chat) => chat.createdAt >= todayStart &&
            chat.createdAt <= todayEnd);
        // console.log(todayMessages);
        // check if receipient is online
        // eslint-disable-next-line no-prototype-builtins
        const markedForNotificatons = todayMessages.filter( (i) => {
          return i["notifyObject"] && i.isRead === 0;
        });

        // const todayUnotifiedList = messages.filter(
        //     // eslint-disable-next-line max-len
        // (chat) => chat.lastNotified >= todayStart
        // && chat.lastNotified <= todayEnd);

        const lastMarkedForNotif =
            markedForNotificatons[markedForNotificatons.length - 1];
        // console.log(lastMarkedForNotif);
        // console.log(todayUnotifiedList);
        // if (todayUnotifiedList.length > 0) {
        if (lastMarkedForNotif) {
          const newNote = {
            "soundNotify": true,
            "image": "{system}",
            "emailInstruction": {
              "template": "message_notification",
              "receipient": null,
            },
            "appSender": environment.appName,
            "isRead": false,
            "title": "New message from {{noteData.senderName}}",
            // eslint-disable-next-line max-len
            "smsMessage": "Hi {{noteData.receipientName}}, {{noteData.senderName}} sent you a message on {{noteData.appName}}. Click on this link {{noteData.chatUrl}} to view on {{noteData.hostUrl}} ",
            "type": "user",
            "content": (lastMarkedForNotif || {}).content || "New message",
            "createdAt": Date.now(),
            "actionPhrase": "view",
            "channels": lastMarkedForNotif.notifyObject.channels,
            "dynamicJson": lastMarkedForNotif.noteData,
            "link": lastMarkedForNotif.noteData.chatUrl,
            "domain": environment.appDomain,
            "id": uuid.v4(),
            "inAppNotified": false,
            "dateRead": "",
            "soundNotified": false,
            "noteGroup": latestData.uid,
          };
          // eslint-disable-next-line max-len
          console.log("pushNotified : ", lastMarkedForNotif.pushNotified, Date.now());
          if (lastMarkedForNotif.pushNotified === false) {
          // console.log(newNote);
          // eslint-disable-next-line max-len
            const docRef = firestore.collection("user/"+lastMarkedForNotif.notifyObject.target+"/notes/");
            docRef.add(newNote);
          }
        }
      }
      // }
      return true;
    });

exports.onChatDelete = functions.firestore.document("chat/{chatId}").onDelete(
    (snapshot)=>{
      const data = snapshot.data();
      // console.log("chat deleted", data);
      // delete from chat where uid is in users
      // eslint-disable-next-line no-prototype-builtins
      if (data && data.users && data.users.length > 0) {
        data.users.forEach((user) => {
          // get user and update chats
          firestore.doc("user/"+user).get().then((res) => {
            if (res.exists) {
              const userData = res.data();
              // update user chats array
              if (userData && userData.chats && userData.chats.length > 0) {
                const chats = userData.chats.filter((i) => i !== snapshot.id);
                firestore.doc("user/"+user).update({chats});
              }
              // update user chatsUsers
              if (userData && userData.chatsUsers && userData.chatsUsers.length > 0) {
                const chatsUsers = userData.chatsUsers.filter((i) => i !== snapshot.user);
                firestore.doc("user/"+user).update({chatsUsers});
              }
            }
          });
        });
      }
      return 1;
    },
);

