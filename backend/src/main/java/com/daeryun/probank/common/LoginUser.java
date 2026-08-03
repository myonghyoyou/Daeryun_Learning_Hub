package com.daeryun.probank.common;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Resolves the controller method parameter to the {@link AuthUser} stored in the current HTTP
 * session, via {@code LoginUserArgumentResolver}. Endpoints annotated with this are expected to
 * already be behind {@code @RequireRole} or otherwise guaranteed to have an authenticated session
 * (e.g. {@code SessionCheckFilter} rejects unauthenticated {@code /api/**} requests before
 * controllers run), so the resolver does not perform its own auth check.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.PARAMETER)
public @interface LoginUser {
}
