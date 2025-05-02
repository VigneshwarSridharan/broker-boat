import axios from 'axios';
import moment from 'moment';
// Add the following import for moment-timezone
import 'moment-timezone';
import { Client, Users } from 'node-appwrite';

const APIClient = axios.create({
  baseURL: 'https://api.upstox.com/v2',
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.UPSTOX_API_KEY}`,
  },
});

const getHistoricalData = async (instrumentKey, log) => {
  const historicalData = await APIClient.get(
    `/historical-candle/${instrumentKey}/day/2023-12-31/2023-01-01`
  ).then((res) => res.data);
  const candles = historicalData.data.candles.reverse();
  const days = candles
    .reduce((final, candle, inx) => {
      if (inx === 0 || inx === candles.length - 1) {
        return final;
      }

      const [timestamp, open, high, low, close, volume] = candle;
      const [
        previousTimestamp,
        previousOpen,
        previousHigh,
        previousLow,
        previousClose,
        previousVolume,
      ] = historicalData.data.candles[inx - 1];
      const date = new Date(timestamp);
      const previousDate = new Date(previousTimestamp);

      log(
        `Date: ${date.toISOString().split('T')[0]}, prevDate: ${previousDate.toISOString().split('T')[0]} Change: ${Number((((close - previousClose) / previousClose) * 100).toFixed(2))}`
      );
      final.push({
        date: moment(timestamp).format('DD MMM YYYY'),
        change: Number(
          (((close - previousClose) / previousClose) * 100).toFixed(2)
        ),
      });

      return final;
    }, [])
    .filter((day) => day.change < -1);

  // Log the historical data to the console
  return days;
};

const placeOrder = async ({ order, log }) => {
  const response = await APIClient.post(`/order/place`, order)
    .then((res) => res.data)
    .catch((err) => {
      log(`Error placing order: ${err}`);
      throw err;
    });

  log(`Order placed: ${JSON.stringify(response)}`);
  return response;
};

export default async (ctx) => {
  const { req, res, log, error } = ctx;

  const today = moment().tz('Asia/Kolkata');
  const result = await APIClient.get(
    `/market/timing/${today.format('YYYY-MM-DD')}`
  ).then((res) => res.data);

  // const historicalData = await getHistoricalData('NSE_EQ|INF109KB15Y7', log);

  log('Path: ', req.path);

  // const result = await placeOrder({
  //   order: {
  //     quantity: 1,
  //     product: 'D',
  //     validity: 'DAY',
  //     price: 0,
  //     instrument_token: 'NSE_EQ|INF109KB15Y7',
  //     order_type: 'MARKET',
  //     transaction_type: 'BUY',
  //     disclosed_quantity: 0,
  //     trigger_price: 0,
  //     is_amo: false,
  //   },
  //   ...ctx,
  // });

  return res.json({ result });
};
