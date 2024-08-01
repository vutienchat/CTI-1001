const PHONE_SCREEN = {
  dialerScreen: "dialer",
  outBoundScreen: "out-bound-screen-wrapper",
  incomingScreen: "incoming-screen",
};

const dialerScreen = document.querySelector(".dialer");
const outBoundScreen = document.querySelector(".out-bound-screen-wrapper");
const incomingScreen = document.querySelector(".incoming-screen");
const acceptCallBtn = document.querySelector("#accept-call-btn");
const dialerBtn = document.querySelectorAll(".dialer-btn");
const displayPhoneNumber = document.querySelector("#displayPhoneNumber");
const makeCallBtn = document.querySelector("#dialer-btn-make-call");
const endCallBtn = document.querySelector("#end-call-btn");

const showScreen = (className) => {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((screen) => {
    screen.style.display = "none";
  });

  const selectedScreen = document.querySelector(`.${className}`);
  if (selectedScreen) {
    selectedScreen.style.display = "block";
  }
};

let agent = anCti.newAgent();
let webphone;
let audio = new Audio();
audio.autoplay = true;

agent.startApplicationSession({
  username: "cti-app@mobifone.vn",
  password: "]6ko.:}_c5p'@6Qb~\\|1",
  url: "wss://as7presales.apac-ancontact.com/cti/ws",
});

agent.on("applicationsessionterminated", (event) => {
  if (event.reason == "invalidApplicationInfo") {
    console.log("Please check your credentials and try again");
  }
});

agent.on("applicationsessionstarted", (event) => {
  console.log("Hello " + event.firstName);
});

agent.on("applicationsessionstarted", (event) => {
  webphone = agent.getDevice("sip:1001@term.307");

  webphone.monitorStart({ rtc: true });
});

agent.on("localstream", (event) => {
  document.getElementById("localView").srcObject = event.stream;
});
agent.on("WSS", (event) => {
  console.log("WS", event.message);
});

agent.on("remotestream", (event) => {
  document.getElementById("remoteView").srcObject = event.stream;
  audio.srcObject = event.stream;
});
navigator.mediaDevices.enumerateDevices().then((mediaDevices) => {
  console.log({ mediaDevices });
  mediaDevices
    .filter(({ kind }) => kind == "audioinput")
    .forEach((dev) => {
      console.log(`VTC ${dev.label} => ${dev.deviceId}`);
    });
});

agent.on("call", (event) => {
  console.log("event", event);
  let call = event.call;
  switch (call.localConnectionInfo) {
    case "alerting":
      console.log(`incomming call from ${call.number} ${call.name}`);
      showScreen(PHONE_SCREEN.incomingScreen);
      break;
    case "connected":
      console.log(`connected to ${call.number}`, call);
      showScreen(PHONE_SCREEN.outBoundScreen);
      break;
    case "fail":
      console.log(`call failed, cause is ${event.content.cause}`);
      break;
    case "hold":
      console.log(`holding call to ${call.number}`);
      break;
    case "null":
      console.log(`call to ${call.number} is gone`);
      showScreen(PHONE_SCREEN.dialerScreen);
      break;
  }
});

acceptCallBtn.onclick = () => {
  let call = webphone.calls[0];
  if (call.localConnectionInfo === "alerting") {
    call.answerCall({ audio: true, video: false });
  }
};

dialerBtn.forEach((btn) => {
  btn.onclick = () => {
    const currentPhoneNumber = displayPhoneNumber.textContent;
    const newPhoneNumber = currentPhoneNumber + btn.textContent;
    displayPhoneNumber.innerHTML = newPhoneNumber;
  };
});

makeCallBtn.addEventListener("click", () => {
  let call = webphone.calls[0];
  if (!call && displayPhoneNumber.textContent) {
    console.log(displayPhoneNumber.textContent);
    webphone.makeCall(displayPhoneNumber.textContent, {
      autoOriginate: "doNotPrompt",
      audio: true,
      video: false,
    });
    showScreen(PHONE_SCREEN.outBoundScreen);
  }
});

endCallBtn.addEventListener("click", () => {
  let call = webphone.calls[0];
  call.clearConnection();
});
