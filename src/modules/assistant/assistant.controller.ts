import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrimaryGuard } from '../../auth/guards/primary.guard';
import { ChatDto } from './dto/assistant.dto';
import { AssistantService } from './assistant.service';

// المساعد الذكي — خاص بصاحب الحساب فقط (بيشوف كل أرقام الشغل).
@Controller('assistant')
@UseGuards(PrimaryGuard)
export class AssistantController {
  constructor(private service: AssistantService) {}

  @Get('status')
  status() {
    return { configured: this.service.isConfigured() };
  }

  @Post('chat')
  chat(@Body() dto: ChatDto) {
    return this.service.chat(dto);
  }
}
