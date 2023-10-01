'use strict';

// @ts-ignore
const utils = require('@iobroker/adapter-core');
// @ts-ignore
const schedule = require('node-schedule');
// @ts-ignore
// @ts-ignore
const axios = require('axios');

let requestTimer;
let astroTimer;
let timerSleep = 0;

let adapter;
const adapterName = require('./package.json').name.split('.').pop();

function startAdapter(options) {
    return (adapter = utils.adapter(
        Object.assign({}, options, {
            name: adapterName,

            ready: main,

            unload: (callback) => {
                adapter.setState('info.connection', false, true);

                try {
                    schedule.cancelJob('dayHistory');
                    clearInterval(requestTimer);
                    clearInterval(astroTimer);
                    clearTimeout(timerSleep);
                    clearTimeout(requestTimeOut);
                    callback();
                } catch (e) {
                    callback();
                }
            },
        }),
    ));
}

async function sleep(ms) {
    return new Promise(async (resolve) => {
        // @ts-ignore
        timerSleep = setTimeout(async () => resolve(), ms);
    });
}

/*************************** Cloud Mode **********************/

let num = 0;
const invmode = {
    0: 'Waiting',
    1: 'Checking',
    2: 'Normal',
    3: 'Off',
    4: 'Permanent Fault',
    5: 'Updating',
    6: 'EPS Check',
    7: 'EPS Mode',
    8: 'Self Test',
    9: 'Idle',
    10: 'Standby',
};

const batmode = {
    0: 'Self Use Mode',
    1: 'Force Time Use',
    2: 'Back Up Mode',
    3: 'Feed-in Priority',
};

function div10(val) {
    return val / 10;
}

function div100(val) {
    return val / 100;
}

const INT16_MAX = 32767;

function to_signed(val) {
    if (val > INT16_MAX) {
        val -= Math.pow(2, 16);
    }

    return val;
}

function twoway_div10(val) {
    return to_signed(val) / 10;
}

function twoway_div100(val) {
    return to_signed(val) / 100;
}

async function requestAPI() {
    return new Promise(async (resolve) => {
        const solaxURL = `http://192.168.178.114`;
        //const solaxURL = (`https://www.eu.solaxcloud.com/proxyApp/proxy/api/getRealtimeInfo.do?tokenId=${adapter.config.apiToken}&sn=${adapter.config.serialNumber}`);

        try {
            // @ts-ignore
            const solaxRequest = await axios.post(
                solaxURL,
                new URLSearchParams({
                    optType: 'ReadRealTimeData',
                    pwd: 'SXRATU6EB5',
                }),
            );
            // adapter.log.debug(`Axios Status: ${solaxRequest.status}`);
            if (solaxRequest.data && solaxRequest.data.Data) {
                // adapter.log.debug(`request-result: ${JSON.stringify(solaxRequest.data)}`);
                num = 0;
                resolve(solaxRequest);
            } else if (
                solaxRequest.data &&
                solaxRequest.data.result &&
                solaxRequest.data.success === false &&
                num <= 5
            ) {
                num++;
                await sleep(10);
                return await fillData();
            } else if (num > 5) {
                adapter.log.debug(
                    `${num} request attempts were started: ${solaxRequest.data.result ? solaxRequest.data.result : ''}`,
                );
                num = 0;
                resolve(solaxRequest);
            }
        } catch (err) {
            adapter.log.debug(`request error: ${err}`);
        }
    });
}

async function fillData() {
    return new Promise(async (resolve) => {
        try {
            const solaxRequest = await requestAPI();

            if (solaxRequest.data && solaxRequest.data.Data) {
                await adapter.setStateAsync('info.connection', true, true);
                await adapter.setStateAsync('info.serialNumber', solaxRequest.data.sn, true);
                await adapter.setStateAsync('info.version', solaxRequest.data.ver, true);
                await adapter.setStateAsync('info.type', 'Q.VOLT HYB-G3-3P', true);
                await adapter.setStateAsync('info.inverterSerial', solaxRequest.data.Information[2], true);

                // Battery Stats

                await adapter.setStateAsync('inverter.networkVoltagePhase1', div10(solaxRequest.data.Data[0]), true);
                await adapter.setStateAsync('inverter.networkVoltagePhase2', div10(solaxRequest.data.Data[1]), true);
                await adapter.setStateAsync('inverter.networkVoltagePhase3', div10(solaxRequest.data.Data[2]), true);
                await adapter.setStateAsync(
                    'inverter.outputCurrentPhase1',
                    twoway_div10(solaxRequest.data.Data[3]),
                    true,
                );
                await adapter.setStateAsync(
                    'inverter.outputCurrentPhase2',
                    twoway_div10(solaxRequest.data.Data[4]),
                    true,
                );
                await adapter.setStateAsync(
                    'inverter.outputCurrentPhase3',
                    twoway_div10(solaxRequest.data.Data[5]),
                    true,
                );
                await adapter.setStateAsync('inverter.powerNowPhase1', to_signed(solaxRequest.data.Data[6]), true);
                await adapter.setStateAsync('inverter.powerNowPhase2', to_signed(solaxRequest.data.Data[7]), true);
                await adapter.setStateAsync('inverter.powerNowPhase3', to_signed(solaxRequest.data.Data[8]), true);
                await adapter.setStateAsync('inverter.acPower', to_signed(solaxRequest.data.Data[9]), true);
                await adapter.setStateAsync('inverter.pv1Voltage', div10(solaxRequest.data.Data[10]), true);
                await adapter.setStateAsync('inverter.pv2Voltage', div10(solaxRequest.data.Data[11]), true);
                await adapter.setStateAsync('inverter.pv1Current', div10(solaxRequest.data.Data[12]), true);
                await adapter.setStateAsync('inverter.pv2Current', div10(solaxRequest.data.Data[13]), true);
                await adapter.setStateAsync('inverter.pv1Power', solaxRequest.data.Data[14], true);
                await adapter.setStateAsync('inverter.pv2Power', solaxRequest.data.Data[15], true);
                await adapter.setStateAsync('inverter.gridFrequencyPhase1', div100(solaxRequest.data.Data[16]), true);
                await adapter.setStateAsync('inverter.gridFrequencyPhase2', div100(solaxRequest.data.Data[17]), true);
                await adapter.setStateAsync('inverter.gridFrequencyPhase3', div100(solaxRequest.data.Data[18]), true);
                await adapter.setStateAsync(
                    'inverter.inverterOperationmode',
                    invmode[solaxRequest.data.Data[19]],
                    true,
                );
                await adapter.setStateAsync('inverter.exportedPower', to_signed(solaxRequest.data.Data[34]), true);
                await adapter.setStateAsync('inverter.powerNow', to_signed(solaxRequest.data.Data[47]), true);
                await adapter.setStateAsync('battery.voltage', div100(solaxRequest.data.Data[39]), true);
                await adapter.setStateAsync('battery.current', twoway_div100(solaxRequest.data.Data[40]), true);
                await adapter.setStateAsync('battery.power', to_signed(solaxRequest.data.Data[41]), true);
                await adapter.setStateAsync('battery.capacity', solaxRequest.data.Data[103], true);
                await adapter.setStateAsync('battery.temp', solaxRequest.data.Data[105], true);
                await adapter.setStateAsync('battery.remainingEnergy', div10(solaxRequest.data.Data[106]), true);
                await adapter.setStateAsync('battery.operationmode', batmode[solaxRequest.data.Data[168]], true);
                await adapter.setStateAsync('total.energy', div10(solaxRequest.data.Data[68] + 65536 * solaxRequest.data.Data[69]), true);
                await adapter.setStateAsync('total.energyResets', solaxRequest.data.Data[69], true);
                await adapter.setStateAsync('total.batteryDischargeEnergy', div10(solaxRequest.data.Data[74] + 65536*solaxRequest.data.Data[75]), true);
                await adapter.setStateAsync('total.batteryDischargeEnergyResets', solaxRequest.data.Data[75], true);
                await adapter.setStateAsync('total.batteryChargeEnergy', div10(solaxRequest.data.Data[76]+ 65536*solaxRequest.data.Data[77]), true);
                await adapter.setStateAsync('total.batteryChargeEnergyResets', solaxRequest.data.Data[77], true);
                await adapter.setStateAsync('todays.batteryDischargeEnergy', div10(solaxRequest.data.Data[78]), true);
                await adapter.setStateAsync('todays.batteryChargeEnergy', div10(solaxRequest.data.Data[79]), true);
                await adapter.setStateAsync('total.pvEnergy', div10(solaxRequest.data.Data[80] + solaxRequest.data.Data[81]*65536), true);
                await adapter.setStateAsync('total.feedinEnergy', div100(solaxRequest.data.Data[86] + solaxRequest.data.Data[87]*65536), true);
                await adapter.setStateAsync('total.feedinEnergyResets', solaxRequest.data.Data[87], true);
                await adapter.setStateAsync('total.pvEnergyResets', solaxRequest.data.Data[81], true);
                await adapter.setStateAsync('todays.energy', div10(solaxRequest.data.Data[82]), true);
                await adapter.setStateAsync('total.consumption', div100(solaxRequest.data.Data[88] + 65536*solaxRequest.data.Data[89]), true);
                await adapter.setStateAsync('total.consumptionResets', solaxRequest.data.Data[89], true);
                await adapter.setStateAsync('todays.feedinEnergy', div100(solaxRequest.data.Data[90]), true);
                await adapter.setStateAsync('todays.consumption', div100(solaxRequest.data.Data[92]), true);
            } else {
                await adapter.setStateAsync('info.connection', false, true);
                adapter.log.debug('SolaX API is currently unavailable');
            }
        } catch (err) {
            adapter.log.warn('request error: ' + err);
        }
        // @ts-ignore
        resolve();
    });
}

/*************************** Expert Local Mode **********************/

let requestTimeOut;

/*************************** End Expert Local Mode **********************/

async function main() {
    const adapterMode = 'cloud';
    await adapter.setObjectNotExistsAsync('info.connectType', {
        type: 'state',
        common: { name: 'Connection Type', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('info.serialNumber', {
        type: 'state',
        common: { name: 'Wifi Serial-Number', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('info.version', {
        type: 'state',
        common: { name: 'Inverter Software Version', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('info.inverterSerial', {
        type: 'state',
        common: { name: 'Inverter Serial-Number', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('info.type', {
        type: 'state',
        common: { name: 'Inverter Type', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.networkVoltagePhase1', {
        type: 'state',
        common: { name: 'Network Voltage Phase 1', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.networkVoltagePhase1', {
        type: 'state',
        common: { name: 'Network Voltage Phase 1', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.networkVoltagePhase1', {
        type: 'state',
        common: { name: 'Network Voltage Phase 1', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.networkVoltagePhase2', {
        type: 'state',
        common: { name: 'Network Voltage Phase 2', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.networkVoltagePhase3', {
        type: 'state',
        common: { name: 'Network Voltage Phase 3', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.outputCurrentPhase1', {
        type: 'state',
        common: { name: 'Output Current Phase 1', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.outputCurrentPhase2', {
        type: 'state',
        common: { name: 'Output Current Phase 2', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.outputCurrentPhase3', {
        type: 'state',
        common: { name: 'Output Current Phase 3', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.powerNowPhase1', {
        type: 'state',
        common: { name: 'Power Now Phase 1', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.powerNowPhase2', {
        type: 'state',
        common: { name: 'Power Now Phase 2', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.powerNowPhase3', {
        type: 'state',
        common: { name: 'Power Now Phase 3', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.acPower', {
        type: 'state',
        common: { name: 'AC Power', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv1Voltage', {
        type: 'state',
        common: { name: 'PV1 Voltage', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv2Voltage', {
        type: 'state',
        common: { name: 'PV2 Voltage', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv1Current', {
        type: 'state',
        common: { name: 'PV1 Current', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv2Current', {
        type: 'state',
        common: { name: 'PV2 Current', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv1Power', {
        type: 'state',
        common: { name: 'PV1 Power', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.pv2Power', {
        type: 'state',
        common: { name: 'PV2 Power', type: 'number', role: 'value.power.production', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.gridFrequencyPhase1', {
        type: 'state',
        common: { name: 'Grid Frequency Phase 1', type: 'number', role: 'value', unit: 'HZ' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.gridFrequencyPhase2', {
        type: 'state',
        common: { name: 'Grid Frequency Phase 2', type: 'number', role: 'value', unit: 'HZ' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.gridFrequencyPhase3', {
        type: 'state',
        common: { name: 'Grid Frequency Phase 3', type: 'number', role: 'value', unit: 'HZ' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.inverterOperationmode', {
        type: 'state',
        common: { name: 'Inverter Operation mode', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.exportedPower', {
        type: 'state',
        common: { name: 'Exported Power', type: 'number', role: 'value.power', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.voltage', {
        type: 'state',
        common: { name: 'Batterie Voltage', type: 'number', role: 'value.voltage', unit: 'V' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.current', {
        type: 'state',
        common: { name: 'Batterie Current', type: 'number', role: 'value.current', unit: 'A' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.power', {
        type: 'state',
        common: { name: 'Batterie Power', type: 'number', role: 'value.power', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('inverter.powerNow', {
        type: 'state',
        common: { name: 'Power Now', type: 'number', role: 'value.power', unit: 'W' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.capacity', {
        type: 'state',
        common: { name: 'Batterie Capacity', type: 'number', role: 'value.battery', unit: 'Percent' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.temp', {
        type: 'state',
        common: { name: 'Batterie Temp', type: 'number', role: 'value.temperature', unit: '°C' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.remainingEnergy', {
        type: 'state',
        common: { name: 'Battery Remaining Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('battery.operationmode', {
        type: 'state',
        common: { name: 'Battery Operation mode', type: 'string', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.energy', {
        type: 'state',
        common: { name: 'Total Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.energyResets', {
        type: 'state',
        common: { name: 'Total Energy Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.batteryDischargeEnergy', {
        type: 'state',
        common: { name: 'Total Battery Discharge Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.batteryDischargeEnergyResets', {
        type: 'state',
        common: { name: 'Total Battery Discharge Energy Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.batteryChargeEnergy', {
        type: 'state',
        common: { name: 'Total Battery Charge Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.batteryChargeEnergyResets', {
        type: 'state',
        common: { name: 'Total Battery Charge Energy Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('todays.batteryDischargeEnergy', {
        type: 'state',
        common: { name: 'Todays Battery Discharge Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('todays.batteryChargeEnergy', {
        type: 'state',
        common: { name: 'Todays Battery Charge Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.pvEnergy', {
        type: 'state',
        common: { name: 'Total PV Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.pvEnergyResets', {
        type: 'state',
        common: { name: 'Total PV Energy Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('todays.energy', {
        type: 'state',
        common: { name: 'Todays Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.consumption', {
        type: 'state',
        common: { name: 'Total Consumption', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('total.consumptionResets', {
        type: 'state',
        common: { name: 'Total Consumption Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
        await adapter.setObjectNotExistsAsync('total.feedinEnergy', {
        type: 'state',
        common: { name: 'Total Feed-In Energy', type: 'number', role: 'value', unit: 'kWh' },
        native: {},
    });
            await adapter.setObjectNotExistsAsync('total.feedinEnergyResets', {
        type: 'state',
        common: { name: 'Total Feed-In Energy Resets', type: 'number', role: 'value', unit: '' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('todays.feedinEnergy', {
        type: 'state',
        common: { name: 'Todays Feed-in Energy', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    await adapter.setObjectNotExistsAsync('todays.consumption', {
        type: 'state',
        common: { name: 'Todays Consumption', type: 'number', role: 'value.power', unit: 'kWh' },
        native: {},
    });
    // await createStates.createdInfoStates(adapter, adapterMode);

    await adapter.setStateAsync('info.connectType', adapterMode, true);

    adapter.log.debug(`Solax is started in ${adapterMode}-mode`);

    fillData();
    const requestInterval = adapter.config.requestInterval || 1;

    adapter.log.debug(`Request Interval: ${requestInterval} minute(s)`);

    requestTimer = setInterval(async () => {
        adapter.log.debug('API Request started ...');
        fillData();
    }, requestInterval * 60000);
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    module.exports = startAdapter;
} else {
    startAdapter();
}
