// Imports
const NodeHelper = require("node_helper");
const { basename } = require("path");
const Log = require("logger");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const moment = require("moment");

module.exports = NodeHelper.create({
  name: basename(__dirname),
  logPrefix: basename(__dirname) + " :: ",
  trackingsData: null,
  parcelEnabled: true,
  defaults: {
    parcelApiKey: null,
    shipments: []
  },
  config: {},
  lang: "en",

  // Start function
  start: function () {
    this.log("starting");
    // Declare any defaults
    this.trackingsData = {};
    this.log("started");
    this.lang = this.getMmConfig().language || "en";
    moment.updateLocale(this.lang);
    moment.locale(this.lang);
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

  getMmConfig() {
    const MM_CONFIG = path.join(process.cwd(), "config", "config.js");
    return eval(
      `function __getConfig(){\n${fs.readFileSync(MM_CONFIG, {
        encoding: "utf8"
      })};\nreturn config;\n}\n__getConfig();`
    );
  },

  sendTrackingsData(data) {
    if (data && Array.isArray(data) && data.length > 0) {
      this.info(`sending ${data.length} results`);
      this._sendNotification("TRACKINGS_UPDATED", data);
    }
  },

  _notificationReceived(notification, payload) {
    switch (notification) {
      case "GET_TRACKINGS":
        this.getTrackingData(payload);
        break;
      default:
    }
  },

  getTrackingData(config) {
    config = {
      parcelApiKey: config.parcelApiKey ?? this.defaults.parcelApiKey,
      shipments: config.shipments ?? this.defaults.shipments
    };

    if (
      !config.shipments ||
      !Array.isArray(config.shipments) ||
      config.shipments.length == 0
    )
      return;
    this.info(`Received ${config.shipments.length} codes...`);

    let trackingsData = [];
    const promises = [];

    // PasarEX
    if (config.parcelApiKey)
      promises.push(this._getParcelApp(config.parcelApiKey, config.shipments));

    Promise.allSettled(promises).then((responses) => {
      trackingsData = responses.reduce((acc, { value }) => {
        return [...acc, ...value];
      }, []);

      this.sendTrackingsData(trackingsData);
    });
  },

  _parseParcelAppShipments(shipments, requestedShipments) {
    const results = [];
    for (const s of shipments) {
      if (!s.trackingId || !s.lastState) {
        results.push({
          ...s,
          location: "Indeterminado",
          date: moment().format("DD/MM/YYYY hh:mm A"),
          status: s.error ?? "indeterminado"
        });
        continue;
      }

      s.lastState = s.lastState ?? {};

      s.lastState.location = s.services
        .map(({ slug }) => slug.toUpperCase().trim())
        .join(" / ");

      const current = requestedShipments.find((o) => s.trackingId == o.code);

      results.push(
        Object.entries({
          ...(this.trackingsData[s.trackingId] ?? {}),
          ...s.lastState
        }).reduce(
          (acc, [k, v]) => {
            switch (k) {
              case "carrier":
                return acc;
              case "date":
                v = moment(v).format("DD/MM/YYYY hh:mm A");
                break;
              default:
                v = `${v}`
                  .trim()
                  .replace(/\([^\)]+\)/i, "")
                  .replace(/\s+-\s+.*$/i, "");
                break;
            }
            return { ...acc, [k]: v };
          },
          { ...current }
        )
      );
    }
    return results;
  },

  _capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  async _getParcelAppDetail(apiKey, uuid, requestedShipments) {
    return await axios
      .get(
        `https://parcelsapp.com/api/v3/shipments/tracking?uuid=${uuid}&apiKey=${apiKey}`
      )
      .then(async ({ data }) => {
        if (
          !data.shipments ||
          !Array.isArray(data.shipments) ||
          data.shipments.length == 0
        )
          return requestedShipments.map((s) => {
            return {
              ...s,
              location: "Indeterminado",
              date: moment().format("DD/MM/YYYY hh:mm A"),
              status: "Indeterminado"
            };
          });
        return await this._parseParcelAppShipments(
          data.shipments,
          requestedShipments
        );
      })
      .catch((error) => {
        this.error(error);
        return requestedShipments.map((s) => {
          return {
            ...s,
            location: "Indeterminado",
            date: moment().format("DD/MM/YYYY hh:mm A"),
            status: `${error}`
          };
        });
      });
  },

  async _getParcelApp(apiKey, requestedShipments) {
    const payloadShipments = requestedShipments.map((s) => ({
      trackingId: s.code,
      country: s.country
    }));
    if (requestedShipments.length <= 0) return;

    return await axios
      .post("https://parcelsapp.com/api/v3/shipments/tracking", {
        shipments: payloadShipments,
        language: this.lang,
        apiKey
      })
      .then(async ({ data }) => {
        if (
          !data.shipments ||
          !Array.isArray(data.shipments) ||
          data.shipments.length == 0
        ) {
          if (!data.uuid) return [];
          return this._getParcelAppDetail(
            apiKey,
            data.uuid,
            requestedShipments
          );
        }
        return await this._parseParcelAppShipments(
          data.shipments,
          requestedShipments
        );
      })
      .catch((error) => {
        this.error(error);
        return requestedShipments.map((s) => {
          return {
            ...s,
            location: "Indeterminado",
            date: moment().format("DD/MM/YYYY hh:mm A"),
            status: `${error}`
          };
        });
      });
  },

  _sendNotification(notification, payload) {
    this.sendSocketNotification(`${this.name}_${notification}`, payload);
  },

  // Socket Notification Received
  socketNotificationReceived(notification, payload) {
    this._notificationReceived(
      notification.replace(new RegExp(`${this.name}_`, "gi"), ""),
      payload
    );
  }
});
