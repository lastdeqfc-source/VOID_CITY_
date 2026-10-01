import os, asyncio
from aiogram import Bot, Dispatcher
from aiogram.types import Message, MenuButtonWebApp, WebAppInfo
from aiogram.filters import CommandStart
from dotenv import load_dotenv

load_dotenv()
TOKEN=os.getenv("BOT_TOKEN")
APP_URL=os.getenv("APP_URL")
bot=Bot(TOKEN)
dp=Dispatcher()

@dp.message(CommandStart())
async def start(m:Message):
    await m.answer(
        "🌑 VOID CITY ULTRA\n\n"
        "Город, экономика, кланы, задания, рейтинг и коллекции.\n"
        "Разработчик: @hiddenvoicer\n\n"
        "Нажми «🎮 Играть» в меню."
    )

async def main():
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="🎮 Играть", web_app=WebAppInfo(url=APP_URL))
    )
    await dp.start_polling(bot)

if __name__=="__main__":
    asyncio.run(main())
