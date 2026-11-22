from sqlalchemy import func, select

ORIGIN = "http://localhost:5173"
PASSWORD = "correct horse battery"
COOKIE = "flexspace_session"


def request(client, method, path, body=None, *, origin=ORIGIN, csrf=None, **kwargs):
    headers = {}
    if origin is not None:
        headers["Origin"] = origin
    if csrf is not None:
        headers["X-CSRF-Token"] = csrf
    return client.request(method, path, json=body, headers=headers, **kwargs)


def post(client, path, body=None, **kwargs):
    return request(client, "POST", path, body, **kwargs)


def put(client, path, body=None, **kwargs):
    return request(client, "PUT", path, body, **kwargs)


def register(client, email="alice@example.com", password=PASSWORD):
    return post(client, "/api/auth/register", {"email": email, "password": password})


def login(client, email="alice@example.com", password=PASSWORD):
    return post(client, "/api/auth/login", {"email": email, "password": password})


def count(session, model):
    return session.scalar(select(func.count()).select_from(model))


def set_cookie(response) -> str:
    return response.headers.get_list("set-cookie")[0].lower()
