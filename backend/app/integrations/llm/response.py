from openai.types.chat import ChatCompletion, ChatCompletionMessage


def checked_message(response: ChatCompletion) -> ChatCompletionMessage:
    if not response.choices:
        raise ValueError("Модель не вернула вариантов ответа")

    choice = response.choices[0]

    if choice.finish_reason != "stop":
        raise ValueError(
            f"Ответ модели завершён некорректно: {choice.finish_reason}"
        )

    message = choice.message

    if message.refusal:
        raise ValueError("Модель отказалась выполнять запрос")

    if not message.content:
        raise ValueError("Модель вернула пустой ответ")

    return message
