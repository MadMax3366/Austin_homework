# SSD-hosted Mac demo

The checked-in user service runs the synthetic demo from `/mnt/ssd/austin-homework` on the `chris` Linux host. It listens only on `127.0.0.1:5173`; it is not exposed to the LAN or public internet.

From the Mac, keep this tunnel open:

```bash
ssh -N -L 5173:127.0.0.1:5173 chris
```

Then open `http://localhost:5173` and click **Sign in with ChatGPT**. In local development this creates only the synthetic `seedy@sites.test` demo cookie.

On the Linux host:

```bash
systemctl --user status austin-homework-demo.service
systemctl --user restart austin-homework-demo.service
journalctl --user -u austin-homework-demo.service
tail -f /mnt/ssd/austin-homework/logs/service.log
```

To restore the original demo state, stop the service first, run `npm run demo:reset` inside `/mnt/ssd/austin-homework`, then start the service again. The reset command moves the previous D1 state to a timestamped backup instead of deleting it.
