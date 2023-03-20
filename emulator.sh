#!/bin/bash
set -e
# Assignment
#let project = 'remotedev-africa'
#Remove previous bucket if exists
delete_previous_version_if_exists() {
  #We either delete local folder and bucket object or just a bucket
  rm -r ./firestore-exports &&
  gsutil -m rm -r gs://remotedev-africa.appspot.com/firestore-exports ||
  gsutil -m rm -r gs://remotedev-africa.appspot.com/firestore-exports
}

export_production_firebase_to_emulator() {
  #Export production firebase to emulator bucket
  gcloud firestore export gs://remotedev-africa.appspot.com/firestore-exports --project=remotedev-africa
  #Copy to local folder
  gsutil -m cp -r gs://remotedev-africa.appspot.com/firestore-exports .
}

run_emulators(){
 firebase emulators:start --import ./firestore-exports
}

#Run bash functions, either delete previous bucket and local folder if exists for update or just export clean way
delete_previous_version_if_exists && export_production_firebase_to_emulator || export_production_firebase_to_emulator && run_emulators