import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

const { ObserveModule, ObserveInstrument } = createObserveModule();
export { ObserveInstrument };

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'code-quest',
    }),
  ],
})
export class AppModule {}
