/* global Module moment */
Module.register("MMM-Tracker", {
  name: "MMM-Tracker",
  logPrefix: "MMM-Tracker :: ",
  suspended: null,
  trackingsData: {},
  ready: false,
  // Declare default inputs
  defaults: {
    parcelApiKey: null,
    fetchInterval: 60 * 60 * 1000,
    shipments: []
  },

  // Logging wrapper
  log(msg, ...args) {
    Log.log(`${this.logPrefix}${msg}`, ...args);
  },
  info(msg, ...args) {
    Log.info(`${this.logPrefix}${msg}`, ...args);
  },
  debug(msg, ...args) {
    Log.debug(`${this.logPrefix}${msg}`, ...args);
  },
  error(msg, ...args) {
    Log.error(`${this.logPrefix}${msg}`, ...args);
  },
  warning(msg, ...args) {
    Log.warning(`${this.logPrefix}${msg}`, ...args);
  },

  // Start process
  start: function () {
    this.sanitizeConfig();
    this.suspended = false;
    this.trackingsData = {};
    this.ready = false;
    // Start function call to node_helper
    this.getTrackings();
  },

  sanitizeConfig: function () {
    this.config = {
      ...this.defaults,
      ...this.config
    };
  },

  stop: function () {
    this.info("stopping module");
  },

  resume: function () {
    this.info("resuming module");
    this.debug("with config: " + JSON.stringify(this.config, null, 2));
    this.suspended = false;
    this.updateDom();
  },

  suspend: function () {
    this.info("suspending module");
    this.suspended = true;
  },

  getDom: function () {
    let wrapper = document.createElement("div");
    wrapper.id = `${this.name}-${this.identifier}`;
    wrapper.classList.add(wrapper.id, `${this.name}-wrapper`, "untouchable");
    if (!this.ready) {
      let loadingDiv = document.createElement("div");
      loadingDiv.innerText = "Loading...";
      wrapper.appendChild(loadingDiv);
    } else if (Object.keys(this.trackingsData).length <= 0) {
      let emptyDiv = document.createElement("div");
      emptyDiv.innerText = "Sin seguimiento";
      wrapper.appendChild(emptyDiv);
    } else {
      let table = document.createElement("table");
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
      const shipmentsData = Object.values(this.trackingsData).sort((a, b) => {
        // Sort by last update
        const aD = moment(a.date, "DD/MM/YYYY hh:mm A");
        const bD = moment(b.date, "DD/MM/YYYY hh:mm A");
        if (aD.isBefore(bD)) return 1;
        else if (bD.isBefore(aD)) return -1;
        return 0;
      });
      for (const s of shipmentsData) {
        let row = document.createElement("tr");
        let detailsRow = document.createElement("tr");
        row.innerHTML = `
        <td class="code small bright bold align-right">${s.code}</td>
        <td class="label small bright bold">${s.label ?? ""}</td>
        <td class="location small bright align-right">${s.location}</td>
        `;
        detailsRow.innerHTML = `
        <td class="date align-right">${s.date}</td>
        <td class="status align-right" colspan="2">${s.status}</td>
        `;
        tbody.appendChild(row);
        tbody.appendChild(detailsRow);
      }

      wrapper.appendChild(table);
    }
    return wrapper;
  },

  getTrackings: function () {
    this.trackingsData = this.config.shipments.reduce((acc, s) => {
      return { ...acc, [s.code]: s };
    }, {});
    // Send Socket Notification and start node_helper
    if (Object.keys(this.trackingsData).length <= 0) {
      this.ready = true;
      this.updateDom();
    } else {
      this._sendNotification("GET_TRACKINGS", this.config);
    }
    setTimeout(() => this.getTrackings(), this.config.fetchInterval);
  },

  _sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  _notificationReceived(notification, payload) {
    switch (notification) {
      case "TRACKINGS_UPDATED":
        let changed = false;
        for (const s of payload) {
          if (!s.code || !Object.keys(this.trackingsData).includes(s.code))
            continue;
          this.trackingsData[s.code] = s;
          changed = true;
        }
        this.ready = this.ready || changed;
        if (this.ready && changed) this.updateDom();
        break;
      default:
        break;
    }
  },

  // Receive Socket Notification
  socketNotificationReceived: function (notification, payload) {
    this._notificationReceived(
      notification.replace(new RegExp(`${this.name}_`, "gi"), ""),
      payload
    );
  },

  // Get the Stylesheet
  getStyles: function () {
    return [this.file(`${this.name}.css`)];
  },

  // Import QR code script file
  getScripts: function () {
    return [this.file("node_modules/moment/min/moment-with-locales.min.js")];
  }
});
