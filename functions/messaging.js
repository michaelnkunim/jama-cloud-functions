const fbadmin = require("firebase-admin");
const axios = require("axios");
const hbs = require("handlebars");
// const fs = require("fs");

const endPoint = "https://jama-api1-lzdsvs7hqq-uc.a.run.app/api";

fbadmin.initializeApp();
const db = fbadmin.firestore();

module.exports = {
  processMessageToChannels(newNote, userId) {
    let userData = {};
    const getUser = db.doc("user/"+userId).get();
    getUser.then((res) => {
      userData = res.data();
      const ts = Date.now();
      const dateOb = new Date(ts);
      const date = dateOb.getDate();
      const month = dateOb.getMonth() + 1;
      const year = dateOb.getFullYear();
      const nowDate = year + "-" + month + "-" + date + " " +
      dateOb.getHours() +":"+ dateOb.getMinutes() +":"+ dateOb.getSeconds();
      newNote.dynamicJson.date = new Date().toLocaleString("en-US", {
        timeZone: "Africa/Accra",
      });
      newNote.dynamicJson.time = nowDate;
      const jsonObject = {userData, noteData: newNote.dynamicJson};

      const patchTitleDynamics = hbs.compile(newNote.title);
      newNote.title = patchTitleDynamics(jsonObject);

      const patchContentDynamics = hbs.compile(newNote.content);
      newNote.content = patchContentDynamics(jsonObject);


      // update document with Dynamic data
      const docRef = db.doc("user/"+userId+"/notes/"+newNote.uid);
      if (newNote.soundNotify === true) {
        newNote.soundNotified = false;
      }

      if (newNote.channels.email === true && jsonObject.userData.email) {
        const templatesRef = db.collection("system_email_templates");
        const snapshot = templatesRef.where("templateName", "==",
            newNote.emailInstruction.template).get();
        snapshot.then((res) => {
          res.forEach((doc) => {
            const blocksRef = db.doc("systemdata/emailBlocks").get();
            blocksRef.then((res) => {
              const blocks = res.data().blocks;
              let blockStructure = res.data().block_structure;

              blocks.forEach((element) => {
                blockStructure =
                blockStructure.
                    replace("[["+element["title"]+"]]", element["markup"]);
              });

              const mailBodyCompiled = hbs.compile(doc.data().markup);
              const mailBody = mailBodyCompiled(jsonObject);

              newNote.mailBody = mailBody;
              newNote.parsedDynamicData = true;

              blockStructure = blockStructure.replace("[[main]]", mailBody);
              const compiledTemplate = hbs.compile(blockStructure);

              const html = compiledTemplate(jsonObject);

              const sendData = {
                "Source": "jama.com.gh@gmail.com",
                "Destination": {
                  "ToAddresses": [jsonObject.userData.email],
                },
                "Message": {
                  "Subject": {"Data": newNote.title},
                  "Body": {"Html": {"Data": html}},
                },
              };

              axios.post(endPoint + "/sendEmail", sendData).then((res) => {
                // console.log(res);
              }, (error) => {
                console.log(error);
              });
            // fs.writeFile('./mailFile.html',mailBody,()=>{
            //   console.log("File Created Successfully");
            // });
            });
          });
        });
      }

      if (newNote.channels.sms === true && userData.phoneNumber) {
        if (newNote.smsMessage) {
          const patchSMSMessage = hbs.compile(newNote.smsMessage);
          newNote.smsMessage = patchSMSMessage(jsonObject);
        }

        const sendData = {
          phoneNumbers: [userData.phoneNumber],
          message: newNote.smsMessage || newNote.content,
          sender_id: "Jama",
        };
        axios.post(endPoint + "/sendSMS", sendData).then((res)=>{
          console.log(res);
        }, (error)=>{
          console.log(error, "error messages");
        });
      }
      docRef.update(newNote);
    // implement this later
    // if (newNote.channels.devicePush === true){
    //    console.log('pushData');
    //  }
    });
  },

};
