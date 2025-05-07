import axios from 'axios';
import moment from 'moment';
import 'moment-timezone';

const APIClient = axios.create({
  baseURL: 'https://api.upstox.com/v2',
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.UPSTOX_API_KEY}`,
  },
});

export default async (ctx) => {
  const startTime = new Date().getTime();
  const { req, res, log, error } = ctx;

  if (req.path !== "/") {
    return res.json({ message: 'Invalid path' });
  }

  const today = moment().tz('Asia/Kolkata');

  log("Checking market timings for today: ", today.format('YYYY-MM-DD HH:mm:ss'));
  const marketTimings = await APIClient.get(
    `/market/timings/${today.format('YYYY-MM-DD')}`
  ).then(({ data: res }) => res.data);

  if (!marketTimings.length) {
    log('Market is closed today');
    return res.json({ message: 'Market is holiday' });
  }

  const NSEMarketTiming = marketTimings.find(
    (market) => market.exchange === 'NSE'
  );

  const NSEMarketOpen = moment(NSEMarketTiming.start_time).tz('Asia/Kolkata');
  const NSEMarketClose = moment(NSEMarketTiming.end_time).tz('Asia/Kolkata');

  if (
    today.isBefore(NSEMarketOpen) ||
    today.isAfter(NSEMarketClose)
  ) {
    log('Market is closed');
    return res.json({ message: 'Market is closed' });
  }

  const stocks = [
    // 'NSE_EQ|INE154A01025', // ITC Limited
    'NSE_EQ|INF209KB19D1', // Aditya Birla Sun Life Nifty 50 ETF 
    'NSE_EQ|INF277KA1976', // Tata Mutual Fund Tata Gold Exchange Traded Fund
  ];

  const result = {
    status: 'success',
  };
  for (const stock of stocks) {
    log('Fetching data for stock:', stock);

    const intradayCandles = await APIClient.get(
      `/historical-candle/intraday/${stock}/30minute`,
    ).then(({ data: res }) => res.data.candles)

    let inx = 0;
    let change = 0;
    let qty = 0;
    let ltp = intradayCandles?.[0]?.[4] || 0
    do {
      if (inx >= intradayCandles.length) {
        break;
      }
      const Candle = intradayCandles[inx];
      const [timestamp, open, high, low, close] = Candle;
      const prevCandle = intradayCandles[inx + 1];
      if (!prevCandle) {
        break;
      }
      const [prevTimestamp, prevOpen, prevHigh, prevLow, prevClose] = prevCandle;

      change = Number(
        (((prevClose - close) / close) * 100).toFixed(2)
      );
      if (change < 0) {
        qty++;
      }

      inx++;
    } while (change < 0);

    if (qty > 0) {

      const fundDetails = await APIClient.get(
        `/user/get-funds-and-margin`
      ).then(({ data: res }) => res.data);

      const balance = fundDetails.equity.available_margin;

      if (balance < 0) {
        log(`Insufficient funds: ${balance}`);
        return res.json({ message: 'Insufficient funds' });
      }

      const brokerageDetails = await APIClient.get(
        `/charges/brokerage?instrument_token=${stock}&quantity=${qty}&product=D&transaction_type=BUY&price=${ltp}`
      ).then(({ data: res }) => res.data);

      const charges = brokerageDetails.charges.total

      const totalPrice = (qty * ltp) + charges


      if (balance < totalPrice) {
        log(`Balance Required: ${totalPrice}. Current balance: ${balance}`)
        return res.json({ message: 'Insufficient funds' });
      }



      const order = await APIClient.post(`/order/place`, {
        quantity: qty,
        product: 'D',
        validity: 'DAY',
        price: 0,
        instrument_token: stock,
        order_type: 'MARKET',
        transaction_type: 'BUY',
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false,
      }
      )
        .then(({ data: res }) => res.data)
        .catch((err) => {
          log(`Error placing order: ${err}`);
          throw err;
        });
      log(`Order placed: ${JSON.stringify(order)}`);
      log(`Quantity: ${qty}`)
      log(`Trade Value (${qty} * ${ltp}): ${qty*ltp}`)
      log(`Charges: ${charges}`)
      log(`Total: ${((qty*ltp)+charges).toFixed(2)}`)
    }


  }


  
  const endTime = new Date().getTime();
  const duration = endTime - startTime;
  log(`Path: ${req.path} - Method: ${req.method} - Duration: ${duration}ms`);
  return res.json({ ...result, duration });
};
