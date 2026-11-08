"""The caller, from the identity headers api-gateway sets.

See contracts/README.md#identity-headers and ADR 0005.
"""

import re
import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

PHONE = re.compile(r"^\+923\d{9}$")


@dataclass(frozen=True)
class Identity:
    user_id: uuid.UUID
    phone: str
    roles: frozenset[str]

    @property
    def is_admin(self) -> bool:
        return "admin" in self.roles


def current_user(
    x_user_id: Annotated[str | None, Header()] = None,
    x_user_phone: Annotated[str | None, Header()] = None,
    x_user_roles: Annotated[str | None, Header()] = None,
) -> Identity:
    """401 without valid headers: the gateway always sends them for signed-in callers."""
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    if x_user_id is None or x_user_phone is None or not PHONE.match(x_user_phone):
        raise unauthorized
    try:
        user_id = uuid.UUID(x_user_id)
    except ValueError:
        raise unauthorized from None
    roles = frozenset(r for r in (x_user_roles or "").split(",") if r)
    return Identity(user_id=user_id, phone=x_user_phone, roles=roles)


def admin(me: Annotated[Identity, Depends(current_user)]) -> Identity:
    if not me.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return me


CurrentUser = Annotated[Identity, Depends(current_user)]
Admin = Annotated[Identity, Depends(admin)]
