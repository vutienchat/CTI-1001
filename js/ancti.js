(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? factory(exports)
    : typeof define === "function" && define.amd
    ? define(["exports"], factory)
    : ((global =
        typeof globalThis !== "undefined" ? globalThis : global || self),
      factory((global.anCti = {})));
})(this, function (exports) {
  "use strict";

  /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

  function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  }

  class EventEmitter {
    constructor(parent) {
      this.listeners = {};
      this.parent = parent;
    }
    on(names, cb) {
      names
        .split(/ +/)
        .forEach((name) =>
          (this.listeners[name] || (this.listeners[name] = [])).push(cb)
        );
      return {
        off: () =>
          names
            .split(/ +/)
            .forEach((name) => this.listeners[name].filter((l) => l !== cb)),
      };
    }
    notify(eventName, data = {}) {
      var _a;
      let event = {
        type: eventName,
        defaultPrevented: false,
        preventDefault: () => {
          event.defaultPrevented = true;
        },
      };
      Object.assign(event, data);
      let emitter = this;
      while (emitter && !event.defaultPrevented) {
        (_a = emitter.listeners[eventName]) === null || _a === void 0
          ? void 0
          : _a.forEach((listener) => listener(event));
        emitter = emitter.parent;
      }
    }
  }

  class Call {
    constructor(agent, device, callID) {
      this.localTracks = {
        audio: undefined,
        video: undefined,
        display: undefined,
      };
      this.candidatePolicy = "none";
      this.candidates = [];
      this.fetchConnectedNumber = false;
      // https://w3c.github.io/webrtc-pc/#perfect-negotiation-example
      this.negotiationNeeded = false;
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.isSettingRemoteAnswerPending = false;
      this.polite = false;
      // non-standard api, just used for legacy implementations as on android
      this.androidWebRTC = false;
      this.agent = agent;
      this.device = device;
      this.callID = callID;
      this.eventEmitter = new EventEmitter(device.eventEmitter);
    }
    // internal, used by agent
    processEvent(name, content) {
      var _a, _b;
      switch (name) {
        case "OriginatedEvent":
          this.fetchConnectedNumber = true;
          this.agent.parseDeviceID(content.calledDevice, this);
          break;
        case "DeliveredEvent":
          if (
            (content === null || content === void 0
              ? void 0
              : content.localConnectionInfo) == "alerting"
          ) {
            this.agent.parseDeviceID(content.callingDevice, this);
          } else {
            this.agent.parseDeviceID(content.calledDevice, this);
            this.fetchConnectedNumber = true;
          }
          break;
        case "EstablishedEvent":
          if (this.fetchConnectedNumber) {
            this.agent.parseDeviceID(content.answeringDevice, this);
            this.fetchConnectedNumber = false;
          }
          break;
        case "TransferedEvent": // ecma style ...
        case "TransferredEvent": {
          // check if callID changed
          if (content.transferredConnections) {
            for (let e of content.transferredConnections) {
              if (
                ((_a = e.connectionListItem.newConnection) === null ||
                _a === void 0
                  ? void 0
                  : _a.callID) &&
                e.connectionListItem.oldConnection
              ) {
                this.callID = e.connectionListItem.newConnection.callID;
                break;
              }
            }
          }
          this.agent.parseDeviceID(content.transferredToDevice, this);
          break;
        }
        case "ConferencedEvent": {
          // check if callID changed
          let peers = [];
          for (let e of content.conferenceConnections) {
            let peer = this.agent.parseDeviceID(
              e.connectionListItem.newConnection.deviceID
            );
            peers.push(peer.number);
            if (peers.length == 1) {
              // on AS the first element is always the own connection
              let newCallID = e.connectionListItem.newConnection.callID;
              if (newCallID != this.callID) {
                this.agent.debug(
                  `conferenced callID changes from ${this.callID} to ${newCallID}`
                );
                this.callID = newCallID;
              }
            }
          }
          // use all numbers of peers
          this.number = peers.join("/");
          break;
        }
      }
      Object.assign(this, content);
      if (
        this.localConnectionInfo == "null" ||
        this.localConnectionInfo == "fail"
      ) {
        this.deletePeerConnection();
        this.device.removeCall(this.callID);
      }
      if (
        (_b = content.lastRedirectionDevice) === null || _b === void 0
          ? void 0
          : _b.numberDialed
      ) {
        this.lastRedirection = this.agent.parseDeviceID(
          content.lastRedirectionDevice.numberDialed
        );
      }
      this.notifyEvent(name, content);
    }
    shutdown() {
      // simulate clear-event from server
      this.agent.debug("force shutdown of call", this.callID);
      this.processEvent("ConnectionClearedEvent", {
        cause: "shutdown",
        droppedConnection: {
          callID: this.callID,
          deviceID: this.device.deviceID,
        },
        localConnectionInfo: "null",
      });
    }
    notifyEvent(name, content) {
      this.eventEmitter.notify("call", {
        call: this,
        name: name,
        device: this.device,
        content: content,
      });
    }
    processSnapshotDevice(snapshotDeviceResponseInfo) {
      var _a, _b;
      const cstate =
        (_b =
          (_a =
            snapshotDeviceResponseInfo === null ||
            snapshotDeviceResponseInfo === void 0
              ? void 0
              : snapshotDeviceResponseInfo.localCallState) === null ||
          _a === void 0
            ? void 0
            : _a.compoundCallState) === null || _b === void 0
          ? void 0
          : _b.localConnectionState;
      if (cstate && !this.localConnectionInfo) {
        this.agent.debug("creating call snapshot call in state", cstate);
        this.localConnectionInfo = cstate;
        this.notifyEvent("SnapshotDeviceResponse", snapshotDeviceResponseInfo);
      }
    }
    processSnapshotCall(snapshotData) {
      snapshotData.forEach((entry) => {
        var _a, _b, _c, _d;
        if (
          ((_b =
            (_a = entry.snapshotCallResponseInfo) === null || _a === void 0
              ? void 0
              : _a.deviceOnCall) === null || _b === void 0
            ? void 0
            : _b.deviceIdentifier) == this.device.deviceID
        ) {
          if (
            (_c = entry.snapshotCallResponseInfo) === null || _c === void 0
              ? void 0
              : _c.localConnectionInfo
          ) {
            this.localConnectionInfo =
              (_d = entry.snapshotCallResponseInfo) === null || _d === void 0
                ? void 0
                : _d.localConnectionInfo;
          }
        } else {
          this.agent.parseDeviceID(
            entry.snapshotCallResponseInfo.deviceOnCall.deviceIdentifier,
            this
          );
        }
      });
      this.notifyEvent("SnapshotCallResponse", snapshotData);
    }
    answerCall(options) {
      return __awaiter(this, void 0, void 0, function* () {
        this.polite = true;
        let msg = {
          AnswerCall: {
            callToBeAnswered: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            constraints: options,
          },
        };
        return this.agent.invoke(msg);
      });
    }
    holdCall() {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          HoldCall: {
            callToBeHeld: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
          },
        });
      });
    }
    retrieveCall() {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          RetrieveCall: {
            callToBeRetrieved: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
          },
        });
      });
    }
    updateCall(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let msg = {
          UpdateCall: {
            callToUpdate: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            correlatorData:
              options === null || options === void 0
                ? void 0
                : options.correlatorData,
          },
        };
        if (
          (options === null || options === void 0 ? void 0 : options.audio) ||
          (options === null || options === void 0 ? void 0 : options.video) ||
          (options === null || options === void 0 ? void 0 : options.display)
        ) {
          msg.UpdateCall.constraints = {
            audio:
              options === null || options === void 0 ? void 0 : options.audio,
            video:
              options === null || options === void 0 ? void 0 : options.video,
            display:
              options === null || options === void 0 ? void 0 : options.display,
          };
        }
        return this.agent.invoke(msg);
      });
    }
    generateDigits(digits, options) {
      return __awaiter(this, void 0, void 0, function* () {
        let msg = {
          GenerateDigits: {
            connectionToSendDigits: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            charactersToSend: digits,
          },
        };
        if (
          options === null || options === void 0 ? void 0 : options.toneDuration
        ) {
          msg.GenerateDigits.toneDuration = options.toneDuration;
        }
        return this.agent.invoke(msg);
      });
    }
    clearConnection() {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          ClearConnection: {
            connectionToBeCleared: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
          },
        });
      });
    }
    singleStepTransferCall(dest) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          SingleStepTransferCall: {
            activeCall: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            transferredTo: dest,
          },
        });
      });
    }
    deflectCall(dest) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          DeflectCall: {
            callToBeDiverted: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            newDestination: {
              device: dest,
            },
          },
        });
      });
    }
    directedPickupCall(dest) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          DirectedPickupCall: {
            callToBePickedUp: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            requestingDevice: dest,
          },
        });
      });
    }
    transferCall(otherCall) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          TransferCall: {
            activeCall: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            heldCall: {
              callID: otherCall.callID,
              deviceID: otherCall.device.deviceID,
            },
          },
        });
      });
    }
    conferenceCall(otherCall) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          ConferenceCall: {
            activeCall: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            heldCall: {
              callID: otherCall.callID,
              deviceID: otherCall.device.deviceID,
            },
          },
        });
      });
    }
    playMessage(messageToBePlayed) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          PlayMessage: {
            overConnection: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            messageToBePlayed: messageToBePlayed,
          },
        });
      });
    }
    stop(messageToBeStopped) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          Stop: {
            connection: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            messageToBeStopped: messageToBeStopped,
          },
        });
      });
    }
    recordMessage(options) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          RecordMessage: {
            callToBeRecorded: {
              callID: this.callID,
              deviceID: this.device.deviceID,
            },
            messageID:
              options === null || options === void 0
                ? void 0
                : options.messageID,
          },
        });
      });
    }
    dispose() {
      this.agent.debug("dispose call " + this.callID);
    }
    setRemoteStream(stream, track) {
      this.remoteStream = stream;
      // setup event-listener to update remote-stream if track ends
      if (stream) {
        stream.onremovetrack = (e) => {
          this.agent.debug(this.callID, "remote-track removed", e);
          this.notifyRemoteStream();
        };
        stream.onaddtrack = (e) => {
          this.agent.debug(this.callID, "remote-track added", e);
        };
        // #6065 Screensharing video-stream periodically mutes and unmutes
        // for video-streams it might happen that they are reported muted
        // while the stream is still active. -> ignore muted
        // (Maybe we should also ignore for audio, but for now I just fix what is needed)
        if (
          (track === null || track === void 0 ? void 0 : track.kind) == "audio"
        ) {
          track.onmute = (e) => {
            this.agent.debug(this.callID, "remote-track muted", e);
            this.notifyRemoteStream(track);
          };
          track.onunmute = (e) => {
            this.agent.debug(this.callID, "remote-track unmuted", e);
            this.notifyRemoteStream(track);
          };
        }
      }
      this.notifyRemoteStream(track);
    }
    notifyRemoteStream(track) {
      //this.agent.debug("notifying remote-track",track,this.remoteStream);
      //this.remoteStream?.getTracks().forEach(t => this.agent.debug("remoteStream tracks:",t));
      this.eventEmitter.notify("remotestream", {
        call: this,
        pc: this.pc,
        stream: this.remoteStream,
        track: track,
      });
    }
    patchConstraints(media, value) {
      if (!value || value === "inactive" || value === "recvonly") {
        return false;
      }
      // enable stream
      let deviceId = this.agent.getMediaDeviceId(media);
      if (deviceId) {
        return { deviceId };
      }
      return true;
    }
    getTransceiver(kind) {
      var _a, _b;
      if (this.androidWebRTC) {
        return undefined;
      }
      let transceiver =
        (_a = this.pc) === null || _a === void 0
          ? void 0
          : _a.getTransceivers().find((t) => {
              var _a, _b;
              return (
                ((_b =
                  (_a = t === null || t === void 0 ? void 0 : t.sender) ===
                    null || _a === void 0
                    ? void 0
                    : _a.track) === null || _b === void 0
                  ? void 0
                  : _b.kind) == kind
              );
            });
      if (!transceiver) {
        // if there is no sender-track yet, let's try the receiver
        transceiver =
          (_b = this.pc) === null || _b === void 0
            ? void 0
            : _b.getTransceivers().find((t) => {
                var _a, _b;
                return (
                  ((_b =
                    (_a = t.receiver) === null || _a === void 0
                      ? void 0
                      : _a.track) === null || _b === void 0
                    ? void 0
                    : _b.kind) == kind
                );
              });
      }
      return transceiver;
    }
    // internal, used by agent
    processGenerateDigits(tones, duration, interToneGap) {
      var _a;
      this.agent.debug("generating digits", tones, duration);
      if (!this.localDtmfSender && this.localTracks.audio) {
        const audioTransceiver = this.getTransceiver("audio");
        this.localDtmfSender =
          (_a =
            audioTransceiver === null || audioTransceiver === void 0
              ? void 0
              : audioTransceiver.sender) === null || _a === void 0
            ? void 0
            : _a.dtmf;
        if (!this.localDtmfSender) {
          this.agent.debug("creating new DTMF sender");
          // fallback to deprecated createDTMFSender
          this.localDtmfSender = this.pc.createDTMFSEnder(
            this.localTracks.audio
          );
        }
      }
      if (this.localDtmfSender) {
        this.localDtmfSender.ontonechange = (event) =>
          this.agent.debug("ontonechange", event);
        this.localDtmfSender.insertDTMF(tones, duration, interToneGap);
      } else {
        this.agent.debug("no DTMF support!");
      }
    }
    // internal, used by agent
    processRtcEvent(content) {
      return __awaiter(this, void 0, void 0, function* () {
        try {
          let remoteDescription =
            content === null || content === void 0
              ? void 0
              : content.remoteDescription;
          if (
            (remoteDescription === null || remoteDescription === void 0
              ? void 0
              : remoteDescription.type) == "close"
          ) {
            this.deletePeerConnection();
            return;
          }
          if (!this.pc) {
            if (
              content === null || content === void 0
                ? void 0
                : content.candidatePolicy
            ) {
              this.candidatePolicy = content.candidatePolicy;
            }
            this.pc = this.createPeerConnection(
              content === null || content === void 0
                ? void 0
                : content.configuration
            );
          }
          // first ensure we have the desired streams and tracks
          if (
            content === null || content === void 0
              ? void 0
              : content.constraints
          ) {
            let userMedia = {};
            let newTracks = {};
            for (let media in content.constraints) {
              if (content.constraints[media]) {
                // hide proprietary direction and adds configured deviceId
                userMedia[media] = this.patchConstraints(
                  media,
                  content.constraints[media]
                );
              }
            }
            // first create new tracks
            if (userMedia.audio) {
              try {
                const stream = yield this.agent.getUserMedia(this, {
                  audio: userMedia.audio,
                });
                this.localStream = this.localStream || stream;
                newTracks.audio = stream.getAudioTracks()[0];
                this.agent.debug("new audio track", newTracks.audio);
              } catch (err) {
                this.agent.info("could not get audio-track", err);
                this.agent.notify("getmediaerror", {
                  call: this,
                  kind: "audio",
                  error: err,
                });
              }
            }
            if (userMedia.display) {
              // as MC for now just supports one video-stream we skip video
              userMedia.video = undefined;
              try {
                // for now no external constraints are supported
                const stream = yield this.agent.getDisplayMedia(this, {
                  audio: false,
                  video: true,
                });
                this.localStream = this.localStream || stream;
                newTracks.display = stream.getVideoTracks()[0];
                this.agent.debug("new display track", newTracks.display);
              } catch (err) {
                this.agent.info("could not get display-media", err);
                this.agent.notify("getmediaerror", {
                  call: this,
                  kind: "display",
                  error: err,
                });
              }
            }
            if (userMedia.video) {
              try {
                const stream = yield this.agent.getUserMedia(this, {
                  video: userMedia.video,
                });
                this.localStream = this.localStream || stream;
                newTracks.video = stream.getVideoTracks()[0];
                this.agent.debug("new video track", newTracks.video);
              } catch (err) {
                this.agent.info("could not get video-track", err);
                this.agent.notify("getmediaerror", {
                  call: this,
                  kind: "video",
                  error: err,
                });
              }
            }
            for (let media in this.localTracks) {
              let newTrack = newTracks[media];
              let oldTrack = this.localTracks[media];
              let transceiver = this.getTransceiver(media);
              let constraints = content.constraints[media];
              this.localTracks[media] = newTrack;
              if (media == "display") {
                // display track is treated together with video
                continue;
              } else if (media == "video") {
                if (!newTrack && newTracks.display) {
                  // use display-track instead
                  newTrack = newTracks.display;
                  constraints = content.constraints.display;
                }
                oldTrack = oldTrack || this.localTracks.display;
              }
              if (oldTrack) {
                this.agent.debug(
                  this.callID,
                  "removing track ",
                  media,
                  oldTrack,
                  transceiver
                );
                this.localStream.removeTrack(oldTrack);
                if (
                  transceiver === null || transceiver === void 0
                    ? void 0
                    : transceiver.sender
                ) {
                  if (!this.androidWebRTC) {
                    transceiver.sender.replaceTrack(newTrack);
                  }
                  this.pc.removeTrack(transceiver.sender);
                }
                oldTrack.stop();
                if (!newTrack && constraints == "inactive") {
                  // no new track will be added, ensure we inactivate
                  // the receiver to not get the remote stream either
                  if (transceiver) {
                    transceiver.direction = constraints;
                  }
                }
              }
              if (newTrack) {
                this.agent.debug(this.callID, "adding track ", media, newTrack);
                this.localStream.addTrack(newTrack);
                if (this.androidWebRTC) {
                  // android/browser does not support addTrack, fallback to deprecated addStream.
                  this.pc.addStream(this.localStream);
                } else if (transceiver) {
                  // other transceiver of same kind found
                  this.agent.debug(this.callID, "replacing track", media);
                  transceiver.sender.replaceTrack(newTrack);
                } else {
                  this.agent.debug(this.callID, "adding track", media);
                  this.pc.addTrack(newTrack, this.localStream);
                }
                // apply sendrecv, sendonly, recvonly, inactive...
                if (constraints === true) {
                  constraints = "sendrecv";
                }
                switch (constraints) {
                  case "sendrecv":
                  case "sendonly":
                  case "recvonly":
                  case "inactive": {
                    if (!transceiver) {
                      transceiver = this.getTransceiver(media);
                    }
                    if (transceiver) {
                      transceiver.direction = constraints;
                    }
                    break;
                  }
                }
                // Avoid sending audio if we're holding: this would be recorded!
                // (Later if we support sending local music-on-hold this might change...)
                if (media == "audio") {
                  // Just enable track on "recvonly" and "sendrecv";
                  // disable on "inactive" and "sendonly"
                  newTrack.enabled = constraints.includes("recv");
                }
              } else {
                // we're not sending, but maybe we would like to receive the media.
                // ensure the offer contains the configured direction
                switch (constraints) {
                  case "recvonly":
                  case "inactive": {
                    if (!transceiver) {
                      transceiver = this.getTransceiver(media);
                    }
                    if (transceiver) {
                      transceiver.direction = constraints;
                    }
                    break;
                  }
                }
              }
            }
            this.negotiationNeeded = true;
          }
          if (remoteDescription) {
            // An offer may come in while we are busy processing SRD(answer).
            // In this case, we will be in "stable" by the time the offer is processed
            // so it is safe to chain it on our Operations Chain now.
            const readyForOffer =
              !this.makingOffer &&
              (this.pc.signalingState == "stable" ||
                this.isSettingRemoteAnswerPending);
            const offerCollision =
              remoteDescription.type == "offer" && !readyForOffer;
            this.ignoreOffer = !this.polite && offerCollision;
            if (this.ignoreOffer) {
              return;
            }
            // process the received remote-sdp
            this.isSettingRemoteAnswerPending =
              remoteDescription.type == "answer";
            yield this.pc.setRemoteDescription(remoteDescription); // SRD rolls back as needed
            this.isSettingRemoteAnswerPending = false;
            // if we received an offer
            if (remoteDescription.type == "offer") {
              yield this.pc.setLocalDescription();
              this.negotiationNeeded = true;
            } else if (remoteDescription.type == "answer") {
              // if we toggle between two calls we have to ensure that
              // the listeners know that the remote-stream might have changed
              this.notifyRemoteStream();
            }
          } else if (this.negotiationNeeded) {
            // no remote-sdp received, so we shall create an offer
            this.makingOffer = true;
            let offer = yield this.pc.createOffer();
            yield this.pc.setLocalDescription(offer);
            this.negotiationNeeded = true;
          }
          if (this.negotiationNeeded) {
            this.sendLocalDescription();
          }
          // after processing the message we inform the clients
          this.eventEmitter.notify("localstream", {
            call: this,
            stream: this.localStream,
          });
        } catch (err) {
          this.makingOffer = false;
          this.agent.error("could not process event", err);
        }
      });
    }
    createPeerConnection(configuration) {
      let pc = new this.agent.RTCPeerConnection(configuration);
      // setup all event-listeners
      pc.addEventListener("track", (event) => {
        this.agent.debug(this.callID, "track", event);
        const track = event.track;
        let [remoteStream] = event.streams;
        if (!remoteStream) {
          // unbelivable: start call with audio+video and then getting "pranswer"
          // => the track has no stream!!!
          // let's manually create a stream to hear early-media
          remoteStream = new MediaStream();
          remoteStream.addTrack(track);
          this.agent.info(
            `created new stream for ${track.type} track`,
            remoteStream
          );
        }
        event.track.addEventListener("unmute", (event2) => {
          this.agent.debug(this.callID + ": unmute", event2);
          this.setRemoteStream(remoteStream, track);
        });
      });
      pc.addEventListener("negotiationneeded", (_event) =>
        __awaiter(this, void 0, void 0, function* () {
          //:this.agent.debug(this.callID,"negotiationneeded",event);
          // event is sometimes fired too late -> set flag manually
          //:this.negotiationNeeded = true;
        })
      );
      pc.addEventListener("icecandidate", ({ candidate }) => {
        if (
          candidate === null || candidate === void 0
            ? void 0
            : candidate.candidate
        ) {
          //:this.agent.debug(this.callID+": icecandidate:",candidate.candidate);
          this.candidates.push(candidate.candidate);
        }
      });
      pc.addEventListener("icegatheringstatechange", (_event) => {
        //:this.agent.debug(this.callID,"icegatheringstatechange:",pc.iceGatheringState);
        if (
          pc.iceGatheringState == "complete" &&
          this.candidatePolicy != "none"
        ) {
          this.sendLocalDescription(this.candidates);
        }
      });
      if (this.androidWebRTC) {
        pc.addEventListener("addstream", ({ stream }) => {
          this.agent.debug(this.callID, "addstream", stream);
          // android seems not to support track-events -> use this instead
          this.setRemoteStream(stream);
        });
        pc.addEventListener("removestream", (_event) => {
          // android seems not to support track-events -> use this instead
          this.setRemoteStream(undefined);
        });
      }
      pc.addEventListener("datachannel", (_event) => {
        //:this.agent.debug(this.callID,"datachannel",event);
      });
      pc.addEventListener("connectionstatechange", (_event) => {
        //:this.agent.debug(this.callID,"connectionstatechange",event);
      });
      pc.addEventListener("signalingstatechange", (_event) => {
        //:this.agent.debug(this.callID,"signalingstatechange",event);
      });
      return pc;
    }
    deletePeerConnection() {
      var _a;
      if (this.pc) {
        // android does not have pc.getSenders
        if (this.pc.getSenders) {
          this.pc.getSenders().forEach((sender) => this.pc.removeTrack(sender));
          // android fails if we call stop -> do it here
          for (let media in this.localTracks) {
            (_a = this.localTracks[media]) === null || _a === void 0
              ? void 0
              : _a.stop();
          }
        }
        this.pc.close();
        for (let media in this.localTracks) {
          this.localTracks[media] = undefined;
        }
        this.pc = undefined;
        this.localStream = undefined;
        this.setRemoteStream(undefined);
        this.eventEmitter.notify("localstream", {
          call: this,
          stream: this.localStream,
        });
      }
    }
    sendLocalDescription(candidates = undefined) {
      var _a, _b;
      // pc.localDescription is not serializable! create own instance:
      const sdp = {
        type:
          (_a = this.pc.localDescription) === null || _a === void 0
            ? void 0
            : _a.type,
        sdp:
          (_b = this.pc.localDescription) === null || _b === void 0
            ? void 0
            : _b.sdp,
      };
      this.negotiationNeeded = false;
      this.agent.send({
        RtcMessage: {
          connection: {
            callID: this.callID,
            deviceID: this.device.deviceID,
          },
          localDescription: sdp,
          candidates: candidates,
        },
      });
      this.makingOffer = false;
    }
    debugTracks(text) {
      var _a;
      this.agent.debug(text);
      (_a = this.pc) === null || _a === void 0
        ? void 0
        : _a.getTransceivers().forEach((t) => {
            var _a, _b, _c, _d;
            this.agent.debug(
              "  media",
              ((_b =
                (_a = t.sender) === null || _a === void 0
                  ? void 0
                  : _a.track) === null || _b === void 0
                ? void 0
                : _b.kind) ||
                ((_d =
                  (_c = t.receiver) === null || _c === void 0
                    ? void 0
                    : _c.track) === null || _d === void 0
                  ? void 0
                  : _d.kind)
            );
            this.agent.debug("    sender   ", t.sender.track);
            this.agent.debug("    receiver ", t.receiver.track);
          });
    }
  }

  class Device {
    constructor(agent, deviceID) {
      this.calls = [];
      this.newMessages = 0;
      this.oldMessages = 0;
      this.config = {};
      this.agent = agent;
      this.deviceID = deviceID;
      this.agent.parseDeviceID(deviceID, this);
      this.eventEmitter = new EventEmitter(agent["eventEmitter"]);
    }
    getCall(callID, create) {
      let call = this.calls.find((c) => c.callID == callID);
      if (!call && create) {
        call = new Call(this.agent, this, callID);
        this.calls.push(call);
      }
      return call;
    }
    getCalls() {
      return this.calls;
    }
    removeCall(callID) {
      let call = undefined;
      this.calls = this.calls.filter((c) => {
        if (c.callID != callID) {
          return true;
        } else {
          call = c;
          return false;
        }
      });
      return call;
    }
    notify(eventName, event = {}) {
      this.agent.debug("notify", eventName);
      this.eventEmitter.notify(eventName, event);
    }
    on(eventName, fn) {
      this.eventEmitter.on(eventName, fn);
    }
    monitorStart(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let msg = {
          MonitorStart: {
            monitorObject: {
              deviceObject: this.deviceID,
            },
          },
        };
        Object.assign(msg.MonitorStart, options);
        let response = yield this.agent.invoke(msg);
        this.monitorCrossRefID = response.monitorCrossRefID;
        Object.assign(this.config, response.config);
        if (this.monitorCrossRefID) {
          this.agent["monitors"][this.monitorCrossRefID] = this;
        }
        return response;
      });
    }
    monitorStop() {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          MonitorStop: {
            monitorCrossRefID: this.monitorCrossRefID,
          },
        });
        this.monitorCrossRefID = undefined;
        return response;
      });
    }
    makeCall(dest, options) {
      var _a;
      return __awaiter(this, void 0, void 0, function* () {
        if (
          (options === null || options === void 0
            ? void 0
            : options.autoOriginate) === true
        ) {
          options.autoOriginate = "doNotPrompt";
        }
        let msg = {
          MakeCall: {
            callingDevice: this.deviceID,
            autoOriginate:
              options === null || options === void 0
                ? void 0
                : options.autoOriginate,
            subjectOfCall:
              options === null || options === void 0
                ? void 0
                : options.subjectOfCall,
            correlatorData:
              options === null || options === void 0
                ? void 0
                : options.correlatorData,
          },
        };
        if (
          (options === null || options === void 0 ? void 0 : options.audio) ||
          (options === null || options === void 0 ? void 0 : options.video)
        ) {
          msg.MakeCall.constraints = {
            audio:
              options === null || options === void 0 ? void 0 : options.audio,
            video:
              options === null || options === void 0 ? void 0 : options.video,
          };
        }
        if (typeof dest === "string") {
          msg.MakeCall.calledDirectoryNumber = dest;
        } else {
          msg.MakeCall.destinationCall = {
            callID: dest.callID,
            deviceID:
              (_a = dest.device) === null || _a === void 0
                ? void 0
                : _a.deviceID,
          };
        }
        if (
          options === null || options === void 0
            ? void 0
            : options.callingNumber
        ) {
          msg.MakeCall.privateData = {
            callingNumber: options.callingNumber,
          };
        }
        return this.agent.invoke(msg);
      });
    }
    directedPickupCall(call) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          DirectedPickupCall: {
            callToBePickedUp: {
              callID: call.callID,
              deviceID: call.device.deviceID,
            },
            requestingDevice: this.deviceID,
          },
        });
      });
    }
    groupPickupCall(pickGroup) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          GroupPickupCall: {
            pickGroup: pickGroup.deviceID,
            newDestination: this.deviceID,
          },
        });
      });
    }
    setForwarding(forwardingType, activateForward, forwardDN, ringDuration) {
      return __awaiter(this, void 0, void 0, function* () {
        let msg = {
          SetForwarding: {
            device: this.deviceID,
            forwardingType: forwardingType,
            activateForward: activateForward,
            forwardDN: forwardDN,
          },
        };
        if (ringDuration) {
          msg.SetForwarding.ringDuration = ringDuration;
        }
        return this.agent.invoke(msg);
      });
    }
    getForwarding() {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          GetForwarding: {
            device: this.deviceID,
          },
        });
      });
    }
    setDoNotDisturb(doNotDisturbOn) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          SetDoNotDisturb: {
            device: this.deviceID,
            doNotDisturbOn: doNotDisturbOn,
          },
        });
      });
    }
    getDoNotDisturb() {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          GetDoNotDisturb: {
            device: this.deviceID,
          },
        });
        this.doNotDisturbOn = response.doNotDisturbOn;
        return response;
      });
    }
    snapshotDevice() {
      var _a, _b;
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          SnapshotDevice: {
            snapshotObject: this.deviceID,
          },
        });
        if (
          (_b =
            (_a = response.crossRefIDorSnapshotData) === null || _a === void 0
              ? void 0
              : _a.snapshotData) === null || _b === void 0
            ? void 0
            : _b.length
        ) {
          response.crossRefIDorSnapshotData.snapshotData.forEach((entry) => {
            var _a, _b;
            const callID =
              (_b =
                (_a = entry.snapshotDeviceResponseInfo) === null ||
                _a === void 0
                  ? void 0
                  : _a.connectionIdentifier) === null || _b === void 0
                ? void 0
                : _b.callID;
            if (callID) {
              let call = this.getCall(callID, true);
              call === null || call === void 0
                ? void 0
                : call.processSnapshotDevice(entry.snapshotDeviceResponseInfo);
            }
          });
        }
        return response;
      });
    }
    snapshotCall(callID) {
      var _a, _b;
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          SnapshotCall: {
            snapshotObject: {
              deviceID: this.deviceID,
              callID: callID,
            },
          },
        });
        if (
          (_b =
            (_a = response.crossRefIDorSnapshotData) === null || _a === void 0
              ? void 0
              : _a.snapshotData) === null || _b === void 0
            ? void 0
            : _b.length
        ) {
          const call = this.getCall(callID, true);
          call === null || call === void 0
            ? void 0
            : call.processSnapshotCall(
                response.crossRefIDorSnapshotData.snapshotData
              );
          response.call = call;
        }
        return response;
      });
    }
    joinCall(activeCall, options = {}) {
      return __awaiter(this, void 0, void 0, function* () {
        if (options.autoOriginate === true) {
          options.autoOriginate = "doNotPrompt";
        }
        if (!options.participationType) {
          options.participationType = "active";
        }
        let msg = {
          JoinCall: {
            activeCall: {
              callID: activeCall.callID,
              deviceID: activeCall.device.deviceID,
            },
            joiningDevice: this.deviceID,
            autoOriginate:
              options === null || options === void 0
                ? void 0
                : options.autoOriginate,
            participationType: options.participationType,
          },
        };
        if (
          (options === null || options === void 0 ? void 0 : options.audio) ||
          (options === null || options === void 0 ? void 0 : options.video)
        ) {
          msg.JoinCall.constraints = {
            audio:
              options === null || options === void 0 ? void 0 : options.audio,
            video:
              options === null || options === void 0 ? void 0 : options.video,
          };
        }
        if (
          options === null || options === void 0
            ? void 0
            : options.callingNumber
        ) {
          msg.JoinCall.privateData = {
            callingNumber: options.callingNumber,
          };
        }
        return this.agent.invoke(msg);
      });
    }
    getPresenceState() {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          GetPresenceState: {
            device: this.deviceID,
          },
        });
        this.updatePresenceState(response);
        return response;
      });
    }
    setPresenceState(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let msg = {
          SetPresenceState: {
            device: this.deviceID,
          },
        };
        if (
          options === null || options === void 0
            ? void 0
            : options.requestedPresenceState
        ) {
          msg.SetPresenceState.requestedPresenceState =
            options.requestedPresenceState;
        }
        if (
          options === null || options === void 0
            ? void 0
            : options.namedPresenceState
        ) {
          msg.SetPresenceState.namedPresenceState = options.namedPresenceState;
        }
        // wait for response and extract the current state
        const response = yield this.agent.invoke(msg);
        this.updatePresenceState(response);
        return response;
      });
    }
    updatePresenceState(content) {
      if (content.hasOwnProperty("presenceState")) {
        this.presenceState = content.presenceState;
      }
      if (content.hasOwnProperty("avatar")) {
        this.avatar = content.avatar;
      }
      if (content.hasOwnProperty("namedPresenceState")) {
        this.namedPresenceState = content.namedPresenceState;
      }
    }
    readDirectories(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          ReadDirectories: {
            scope: this.deviceID,
            text: options.text,
            limit: options.limit,
            match: options.match,
            avatars: options.avatars,
            deviceIds: options.deviceIds,
          },
        });
        return response.entries;
      });
    }
    readCallDetails(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          ReadCallDetails: {
            device: this.deviceID,
            since:
              options === null || options === void 0 ? void 0 : options.since,
            limit:
              options === null || options === void 0 ? void 0 : options.limit,
            offset:
              options === null || options === void 0 ? void 0 : options.offset,
            avatars: options.avatars,
          },
        });
        return response.entries;
      });
    }
    readVoicemail(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.agent.invoke({
          ReadVoicemails: {
            device: this.deviceID,
            since:
              options === null || options === void 0 ? void 0 : options.since,
            limit:
              options === null || options === void 0 ? void 0 : options.limit,
            offset:
              options === null || options === void 0 ? void 0 : options.offset,
            avatars: options.avatars,
          },
        });
        return response.entries;
      });
    }
    deleteVoicemail(id) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          DeleteVoicemail: {
            device: this.deviceID,
            id,
          },
        });
      });
    }
    updateVoicemail(id, options) {
      return __awaiter(this, void 0, void 0, function* () {
        return this.agent.invoke({
          UpdateVoicemail: Object.assign(
            { device: this.deviceID, id },
            options
          ),
        });
      });
    }
    processPresenceState(content) {
      this.updatePresenceState(content);
      this.eventEmitter.notify("presencestate", {
        name: "PresenceStateEvent",
        device: this,
        presenceState: content.presenceState,
      });
    }
    processMessageSummary(content) {
      this.newMessages = +content.newMessages || 0;
      this.oldMessages = +content.oldMessages || 0;
      this.eventEmitter.notify("messagesummary", {
        name: "MessageSummaryEvent",
        device: this,
        newMessages: this.newMessages,
        oldMessages: this.oldMessages,
      });
    }
    processDoNotDisturb(content) {
      this.doNotDisturbOn = content.doNotDisturbOn;
      this.eventEmitter.notify("donotdisturb", {
        name: "DoNotDisturbEvent",
        device: this,
        doNotDisturbOn: content.doNotDisturbOn,
      });
    }
    processForward(content) {
      this.eventEmitter.notify("forward", {
        name: "ForwardEvent",
        device: this,
        forwardDN: content.forwardDN,
        forwardStatus: content.forwardStatus,
        forwardingType: content.forwardingType,
      });
    }
    processActivity(content) {
      const options = Object.assign(
        { name: "ActivityEvent", device: this },
        content
      );
      this.eventEmitter.notify("activity", options);
    }
  }

  var _a, _b, _c;
  class Agent {
    constructor() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      this.invokeId = 0;
      this.invokeIdPrefix = ""; // allows to identify invokeId-originators for debugging
      this.applicationID = "ancti";
      this.authentication = "digest";
      this.processRtcEvents = true;
      this.invocations = {};
      this.queue = [];
      this.reconnectDelay = 5000;
      this.keepaliveInterval = 0;
      this.invocationTimeout = 0;
      this.devices = [];
      this.monitors = {};
      this.eventEmitter = new EventEmitter();
      this.config = {};
      this.error = console.error.bind(console);
      this.warn = console.warn.bind(console);
      this.info = console.info.bind(console);
      this.debug = console.debug.bind(console);
      this.RTCSessionDescription =
        (_a = Agent.window) === null || _a === void 0
          ? void 0
          : _a.RTCSessionDescription;
      this.RTCPeerConnection =
        (_b = Agent.window) === null || _b === void 0
          ? void 0
          : _b.RTCPeerConnection;
      this.mediaDevices =
        (_d =
          (_c = Agent.window) === null || _c === void 0
            ? void 0
            : _c.navigator) === null || _d === void 0
          ? void 0
          : _d.mediaDevices;
      this.MediaStream =
        (_e = Agent.window) === null || _e === void 0 ? void 0 : _e.MediaStream;
      // per default take the same url as the library was loaded from
      this.url = Agent.scriptSrc;
      if (
        !((_f = this.url) === null || _f === void 0
          ? void 0
          : _f.startsWith("http")) &&
        ((_g = Agent.window) === null || _g === void 0 ? void 0 : _g.location)
      ) {
        if (
          (_h = this.url) === null || _h === void 0
            ? void 0
            : _h.startsWith("/")
        ) {
          this.url = Agent.window.location.origin + this.url;
        } else {
          this.url = Agent.window.location.href;
        }
      }
      if (this.url) {
        this.url = this.url.replace(/^http/, "ws");
        //this.url = this.url.replace(/\/([^/]+)$/,"/ws")
        this.url = this.url.replace(/\/cti\/.*$/, "/cti/ws");
        this.debug("url", this.url);
      }
    }
    notify(eventName, event = {}) {
      this.debug("notify", eventName, event);
      this.eventEmitter.notify(eventName, event);
    }
    getMediaDeviceId(media) {
      if (media == "audio") return this.audioDeviceId;
      if (media == "video") return this.videoDeviceId;
      return undefined;
    }
    getUserMedia(call, constraints) {
      return this.mediaDevices.getUserMedia(constraints);
    }
    getDisplayMedia(call, constraints) {
      return this.mediaDevices.getDisplayMedia(constraints);
    }
    on(eventName, fn) {
      this.eventEmitter.on(eventName, fn);
    }
    urlParam(name) {
      var _a;
      return new URL(
        (_a = Agent.window) === null || _a === void 0
          ? void 0
          : _a.location.href
      ).searchParams.get(name);
    }
    getDevice(deviceID) {
      // map "pbx."" domains to "ou."
      deviceID =
        deviceID === null || deviceID === void 0
          ? void 0
          : deviceID.replace(/(.*)@pbx\.(\d+)$/, "$1@ou.$2");
      let device = this.devices.find((d) => d.deviceID == deviceID);
      if (!device) {
        device = new Device(this, deviceID);
        this.devices.push(device);
      }
      return device;
    }
    getDevices() {
      return this.devices;
    }
    registerMonitor(deviceID, monitorCrossRefID) {
      let device = this.getDevice(deviceID);
      this.monitors[monitorCrossRefID] = device;
      return device;
    }
    setAudioDeviceId(deviceId) {
      this.audioDeviceId = deviceId;
      this.debug("audioDeviceId is", deviceId);
    }
    setVideoDeviceId(deviceId) {
      this.videoDeviceId = deviceId;
      this.debug("videoDeviceId is", deviceId);
    }
    send(message) {
      var _a;
      this.removeUndefinedMembers(message);
      if (!this.connected) {
        this.queue.push(message);
      } else {
        this.info("send:", message);
        let text = JSON.stringify(message);
        try {
          (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(text);
        } catch (error) {
          this.error("websocket cannot send", error);
        }
      }
    }
    invoke(message) {
      return __awaiter(this, void 0, void 0, function* () {
        let invId = `${this.invokeIdPrefix}${++this.invokeId}`;
        let promise = new Promise(
          (resolve, reject) =>
            (this.invocations[invId] = { resolve: resolve, reject: reject })
        );
        let data = Object.values(message)[0];
        data.invokeID = invId;
        if (this.invocationTimeout > 0) {
          setTimeout(() => {
            var _a;
            const invocation = this.invocations[invId];
            if (invocation) {
              invocation.reject("timeout");
              (_a = this.ws) === null || _a === void 0 ? void 0 : _a.close();
            }
          }, this.invocationTimeout * 1000);
        }
        this.send(message);
        return promise;
      });
    }
    startKeepalive() {
      if (this.keepaliveInterval > 0) {
        setTimeout(() => {
          if (this.connected) {
            this.debug("sending keepalive");
            this.ws.send("");
            this.startKeepalive();
          }
        }, this.keepaliveInterval * 1000);
      }
    }
    onSocketOpen() {
      this.connected = true;
      this.startKeepalive();
      this.sendStartApplicationSession();
    }
    onSocketError(error) {
      this.info("socket error:", error);
      this.disconnect();
      this.processApplicationSessionTerminated("error");
    }
    onSocketClose(error) {
      this.info("socket closed:", error);
      this.disconnect();
      this.processApplicationSessionTerminated("error");
    }
    onSocketMessage(event) {
      try {
        let message = JSON.parse(event.data);
        this.info("recv:", message);
        this.processMessage(message);
        this.eventEmitter.notify("WSS", {
          name: "WSSEvent",
          message,
        });
      } catch (error) {
        this.error("cannot process message", error);
      }
    }
    processMessage(message) {
      var _a, _b, _c, _d;
      let name = Object.keys(message)[0];
      let content = message[name] || {};
      let device = this.monitors[content.monitorCrossRefID];
      let call;
      let invId = content.invokeID;
      let invocation = invId ? this.invocations[invId] : undefined;
      switch (name) {
        // Events
        case "ServiceInitiatedEvent":
          call = device.getCall(content.initiatedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "FailedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.failedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "ConnectionClearedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.droppedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "OriginatedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.originatedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "DeliveredEvent":
        case "DivertedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.connection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "EstablishedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.establishedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "HeldEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.heldConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "RetrievedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.retrievedConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "TransferedEvent": // ecma style...
        case "TransferredEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.primaryOldCall.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          if (content.localConnectionInfo == "null") {
            // secondary old call is gone as well
            call = device.getCall(
              (_a = content.secondaryOldCall) === null || _a === void 0
                ? void 0
                : _a.callID
            );
            call === null || call === void 0
              ? void 0
              : call.processEvent(name, content);
          }
          break;
        case "ConferencedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.primaryOldCall.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "DtmfDetectedEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.overConnection.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processEvent(name, content);
          break;
        case "StopEvent":
          device === null || device === void 0
            ? void 0
            : device.notify("call", {
                // note that call might be gone already
                name: name,
                content: content,
                call: device.getCall(content.connection.callID),
              });
          break;
        case "DoNotDisturbEvent":
          device === null || device === void 0
            ? void 0
            : device.processDoNotDisturb(content);
          break;
        case "ForwardEvent":
          device === null || device === void 0
            ? void 0
            : device.processForward(content);
          break;
        // Proprietary events
        case "RtcEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.connection.callID, true);
          if (this.processRtcEvents) {
            call === null || call === void 0
              ? void 0
              : call.processRtcEvent(content);
          }
          break;
        case "GenerateDigitsEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(content.connectionToSendDigits.callID, true);
          call === null || call === void 0
            ? void 0
            : call.processGenerateDigits(
                content.charactersToSend,
                content.toneDuration
              );
          break;
        case "MessageSummaryEvent":
          device === null || device === void 0
            ? void 0
            : device.processMessageSummary(content);
          break;
        case "ActivityEvent":
          device === null || device === void 0
            ? void 0
            : device.processActivity(content);
          break;
        case "ConferenceUpdateEvent":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(
                  (_b = content.connection) === null || _b === void 0
                    ? void 0
                    : _b.callID,
                  false
                );
          if (call === null || call === void 0 ? void 0 : call.pc) {
            // ignore the ConferenceUpdateEvent if we have no peer webRTC connection
            // in that case we just passively observe the conference, but we aren't involved in the media
            this.notify("conferenceupdate", { name, call, content });
          } else {
            console.log(
              "Ignore ConferenceUpdateEvent, there's no webRTC connection to update"
            );
          }
          break;
        case "ConferenceStream":
          call =
            device === null || device === void 0
              ? void 0
              : device.getCall(
                  (_c = content.connection) === null || _c === void 0
                    ? void 0
                    : _c.callID,
                  false
                );
          if (call === null || call === void 0 ? void 0 : call.pc) {
            // ignore the ConferenceUpdateEvent if we have no peer webRTC connection
            // in that case we just passively observe the conference, but we aren't involved in the media
            this.notify("conferencestream", { name, call, content });
          } else {
            console.log(
              "Ignore ConferenceStream, there's no webRTC connection to update"
            );
          }
          break;
        // events outside of a monitor
        case "PresenceStateEvent":
          device = this.devices.find((dev) => dev.deviceID == content.device);
          device === null || device === void 0
            ? void 0
            : device.processPresenceState(content);
          break;
        case "ApplicationSessionTerminated":
          this.processApplicationSessionTerminated(
            (_d =
              content === null || content === void 0
                ? void 0
                : content.sessionTermReason) === null || _d === void 0
              ? void 0
              : _d.definedTermReason
          );
          break;
        case "CSTAErrorCode":
          invocation === null || invocation === void 0
            ? void 0
            : invocation.reject(content);
          break;
        default:
          if (invocation) {
            invocation.resolve(content);
          } else {
            this.info("unknown message:", name);
          }
      }
      if (invocation) {
        delete this.invocations[content.invokeID];
      } else {
        this.notify("event", {
          deviceID:
            device === null || device === void 0 ? void 0 : device.deviceID,
          monitorCrossRefID:
            content === null || content === void 0
              ? void 0
              : content.monitorCrossRefID,
          callID: call === null || call === void 0 ? void 0 : call.callID,
          name,
          message,
        });
      }
    }
    reconnect() {
      this.disconnect();
      this.debug("reconnecting to", this.url);
      try {
        if (this.url) {
          this.ws = new WebSocket(this.url);
          this.ws.onopen = () => this.onSocketOpen();
          this.ws.onerror = (e) => this.onSocketError(e);
          this.ws.onclose = (e) => this.onSocketClose(e);
          this.ws.onmessage = (e) => this.onSocketMessage(e);
        }
      } catch (error) {
        this.error("could not setup socket", error);
      }
      this.startReconnectTimeout();
    }
    startReconnectTimeout(delay = this.reconnectDelay) {
      try {
        this.info(`reconnecting in ${delay} milliseconds`);
        this.reconnectTimeout && clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          if (this.reconnecting && !this.connected) {
            this.reconnect();
          }
        }, delay);
      } catch (error) {
        this.error("cannot start reconnect timeout", error);
      }
    }
    disconnect() {
      this.connected = false;
      if (this.ws) {
        try {
          this.ws.onopen = undefined;
          this.ws.onerror = undefined;
          this.ws.onclose = undefined;
          this.ws.onmessage = undefined;
          this.debug("before closing websocket");
          this.ws.close();
          this.debug("after closing websocket");
        } catch (error) {
          this.error("websocket cannot close", error);
        }
        this.debug("disconnected websocket");
      }
      this.ws = undefined;
    }
    startApplicationSession(options = { token: true }) {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      this.url = options.url || this.url;
      this.username = options.username || this.username;
      this.password = options.password || this.password;
      this.authentication = options.authentication || this.authentication;
      this.keepaliveInterval = options.keepaliveInterval || 0;
      this.invocationTimeout = options.invocationTimeout || 0;
      this.token = options.token || this.token;
      this.profile = options.profile || this.profile;
      this.accessKey = options.accessKey || this.accessKey;
      this.applicationID = options.applicationID || this.applicationID;
      this.userAgent = options["userAgent"] || this.userAgent;
      this.guest = options.guest;
      this.requestedSessionDuration = options.requestedSessionDuration;
      this.reconnecting = true;
      if (options.clickToCall) {
        if (typeof options.clickToCall === "string") {
          this.clickToCall = { deviceID: options.clickToCall, audio: true };
        } else {
          this.clickToCall = options.clickToCall;
        }
      }
      if (this.clickToCall || options.reconnect === false) {
        this.reconnecting = false;
      }
      if (this.token === true) {
        // for backward  compatibility, token:true is converted to cookie:"ANAUTH"
        options.cookie = "ANAUTH";
      }
      if (options.cookie) {
        const re = new RegExp(`${options.cookie}=([^;]+)`);
        this.token =
          (_d =
            (_c =
              (_b =
                (_a = Agent.window) === null || _a === void 0
                  ? void 0
                  : _a.document) === null || _b === void 0
                ? void 0
                : _b.cookie) === null || _c === void 0
              ? void 0
              : _c.match(re)) === null || _d === void 0
            ? void 0
            : _d[1];
      }
      if (
        !((_e = Agent.window) === null || _e === void 0
          ? void 0
          : _e.TextEncoder) ||
        !((_h =
          (_g =
            (_f = Agent.window) === null || _f === void 0
              ? void 0
              : _f.crypto) === null || _g === void 0
            ? void 0
            : _g.subtle) === null || _h === void 0
          ? void 0
          : _h.digest)
      ) {
        // digest only available on https pages
        this.authentication = "basic";
      }
      if (!this.connected) {
        this.reconnect();
      } else {
        this.sendStartApplicationSession();
      }
    }
    sendStartApplicationSession() {
      this.invoke({
        StartApplicationSession: {
          applicationInfo: {
            applicationID: this.applicationID,
            applicationSpecificInfo: {
              username: this.username,
              password:
                this.authentication == "basic" ? this.password : undefined,
              token: this.token,
              accessKey: this.accessKey,
              userAgent: this.getUserAgent(),
              config: true,
              clickToCall: this.clickToCall,
              guest: this.guest,
              profile: this.profile,
            },
          },
        },
      }).then((response) => {
        var _a;
        if (
          ((_a = response.extensions) === null || _a === void 0
            ? void 0
            : _a.nonce) &&
          this.username &&
          this.password &&
          this.authentication == "digest"
        ) {
          const msgUint8 = new TextEncoder().encode(
            this.username +
              ":" +
              this.password +
              ":" +
              response.extensions.nonce
          ); // encode as (utf-8) Uint8Array
          crypto.subtle.digest("SHA-256", msgUint8).then((hashBuffer) => {
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            this.invoke({
              StartApplicationSession: {
                applicationInfo: {
                  applicationID: this.applicationID,
                  applicationSpecificInfo: {
                    username: this.username,
                    response: hashHex,
                    userAgent: this.getUserAgent(),
                    config: true,
                    profile: this.profile,
                  },
                },
                requestedSessionDuration: this.requestedSessionDuration,
              },
            }).then((response2) => {
              this.processStartApplicationSessionResponse(response2);
            });
          });
        } else {
          this.processStartApplicationSessionResponse(response);
        }
      });
    }
    processStartApplicationSessionResponse(response) {
      var _a;
      if (response.errorCode) {
        this.processApplicationSessionTerminated(response.errorCode);
      } else {
        this.sessionID = response.sessionID;
        this.sessionDuration = response.actualSessionDuration;
        Object.assign(this.config, response.config);
        // automatically initialise devices with received config
        (_a = this.config.deviceList) === null || _a === void 0
          ? void 0
          : _a.forEach((cfg) => {
              const device = this.getDevice(cfg.deviceID);
              device.autoAnswer = cfg.autoAnswer;
              device.type = cfg.type;
              device.name = cfg.name;
              device.publicNumber = cfg.publicNumber;
              device.number = cfg.number;
              device.terminal = cfg.terminal;
              device.rtc = cfg.type == "cti";
            });
        this.notify("applicationsessionstarted", this.config);
        while (this.queue.length) {
          this.send(this.queue.shift());
        }
        if (response.clickToCall) {
          // the session automatically monitors the clickToCall device
          this.monitors[response.monitorCrossRefID] = this.getDevice(
            response.clickToCall.deviceID
          );
        } else if (response.config.guest) {
          this.monitors[response.monitorCrossRefID] = this.getDevice(
            response.config.guest.deviceID
          );
        }
      }
    }
    processApplicationSessionTerminated(reason) {
      if (
        reason == "shutdown" ||
        reason == "normal" ||
        reason == "invalidApplicationInfo" ||
        this.clickToCall
      ) {
        this.reconnecting = false;
      }
      if (!this.reconnecting) {
        this.sessionID = undefined;
        this.disconnect();
        this.config = {};
        this.devices.forEach((device) =>
          device.calls.forEach((call) => call.shutdown())
        );
      }
      this.eventEmitter.notify("applicationsessionterminated", {
        reason: reason,
        reconnecting: this.reconnecting,
      });
      if (this.reconnecting) {
        this.startReconnectTimeout();
      }
    }
    stopApplicationSession() {
      this.invoke({
        StopApplicationSession: {
          sessionID: this.sessionID,
          sessionEndReason: {
            appEndReason: "normal",
          },
        },
      })
        .then(() => {
          this.reconnecting = false;
          this.disconnect();
        })
        .catch((error) => {
          this.error("could not stop application-session", error);
        });
      this.processApplicationSessionTerminated("normal");
    }
    restartApplicationSession(delayMillis) {
      this.disconnect();
      this.eventEmitter.notify("applicationsessionterminated", {
        reason: "restart",
        reconnecting: this.reconnecting,
      });
      this.startReconnectTimeout(delayMillis);
    }
    resetApplicationSessionTimer(requestedSessionDuration) {
      this.invoke({
        ResetApplicationSessionTimer: {
          requestedSessionDuration: requestedSessionDuration,
        },
      }).then((response) => {
        this.sessionDuration = response.actualSessionDuration;
      });
    }
    readDirectories(options) {
      return __awaiter(this, void 0, void 0, function* () {
        let response = yield this.invoke({
          ReadDirectories: {
            text: options.text,
            limit: options.limit,
            scope: options.scope,
          },
        });
        return response.entries;
      });
    }
    // Utility functions
    parseDeviceID(deviceID, target = {}) {
      if (deviceID) {
        if (deviceID.hasOwnProperty("deviceIdentifier")) {
          deviceID = deviceID.deviceIdentifier;
        }
        if (deviceID) {
          let match = deviceID.match(/sip:([^@]*)/);
          if (match) {
            target.number = match[1];
            target.name = "";
          } else {
            match = deviceID.match(/N<([^>]*)>(.*)/);
            if (match) {
              target.number = match[1];
              target.name = match[2];
            }
          }
        }
      }
      return target;
    }
    getMember(obj, ...path) {
      for (const name of path) {
        obj[name] = obj[name] || {};
        obj = obj[name];
      }
      return obj;
    }
    removeUndefinedMembers(obj) {
      try {
        Object.keys(obj).forEach((key) => {
          let val = obj[key];
          if (val === undefined || val == null) {
            delete obj[key];
          } else if (typeof val === "object") {
            if (Object.keys(val).length == 0) {
              // RTCSessionDescription and others have no keys, just symbols. Just delete if there are no symbols.
              if (
                Object.getOwnPropertySymbols(Object.getPrototypeOf(val))
                  .length == 0
              ) {
                delete obj[key];
              }
            } else {
              this.removeUndefinedMembers(val);
            }
          }
        });
      } catch (error) {
        this.error("cannot remove undefined members", error);
      }
    }
    getUserAgent() {
      if (!this.userAgent) {
        this.userAgent = this.detectBrowser();
      }
      return this.userAgent;
    }
    detectBrowser() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent
      if (
        (_b =
          (_a = Agent.window) === null || _a === void 0
            ? void 0
            : _a.navigator) === null || _b === void 0
          ? void 0
          : _b.userAgent
      ) {
        let ua = navigator.userAgent;
        let chrome =
          (_c = /Chrome\/([0-9.]+)/.exec(ua)) === null || _c === void 0
            ? void 0
            : _c[1];
        let firefox =
          (_d = /Firefox\/([0-9.]+)/.exec(ua)) === null || _d === void 0
            ? void 0
            : _d[1];
        let seamonkey =
          (_e = /Seamonkey\/([0-9.]+)/.exec(ua)) === null || _e === void 0
            ? void 0
            : _e[1];
        let chromium =
          (_f = /Chromium\/([0-9.]+)/.exec(ua)) === null || _f === void 0
            ? void 0
            : _f[1];
        let safari =
          (_g = /Safari\/([0-9.]+)/.exec(ua)) === null || _g === void 0
            ? void 0
            : _g[1];
        let opera =
          (_h = /OPR\/([0-9.]+)/.exec(ua)) === null || _h === void 0
            ? void 0
            : _h[1];
        if (firefox && !seamonkey) return `firefox/${firefox}`;
        if (seamonkey) return `seamonkey/${seamonkey}`;
        if (chrome && !chromium) return `chrome/${chrome}`;
        if (chromium) return `chromium/${chromium}`;
        if (safari && !chrome && !chromium) return `safari/${safari}`;
        if (opera) return `opera/${opera}`;
      }
      return "unknown";
    }
    requestSystemStatus() {
      return __awaiter(this, void 0, void 0, function* () {
        return this.invoke({
          RequestSystemStatus: {},
        });
      });
    }
  }
  Agent.window = typeof window == "undefined" ? {} : window;
  Agent.scriptSrc =
    (_c =
      (_b =
        (_a = Agent.window) === null || _a === void 0
          ? void 0
          : _a.document) === null || _b === void 0
        ? void 0
        : _b.currentScript) === null || _c === void 0
      ? void 0
      : _c.getAttribute("src");
  function newAgent() {
    return new Agent();
  }

  const version = "7.14.3";
  const date = "24-03-06-10:00:07";

  /**
   * Factory method as entry point to API
   */
  /**
   * As name of modules changed from "AnCti" to "anCti"
   * we create an alias for backwards compatibility.
   */
  if (typeof window !== "undefined") {
    window.AnCti = window.anCti;
  }

  exports.date = date;
  exports.newAgent = newAgent;
  exports.version = version;

  Object.defineProperty(exports, "__esModule", { value: true });
});
//# sourceMappingURL=ancti.js.map
