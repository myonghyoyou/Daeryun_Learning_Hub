package com.daeryun.probank.service;

import com.daeryun.probank.common.AuthUser;
import com.daeryun.probank.dto.user.UserCreateRequest;
import com.daeryun.probank.dto.user.UserCreateResponse;
import com.daeryun.probank.dto.user.UserListItem;
import com.daeryun.probank.dto.user.UserUpdateRequest;

import java.util.List;

public interface UserAdminService {
    List<UserListItem> list(Long departmentId);
    UserCreateResponse create(UserCreateRequest request, AuthUser actor);
    void update(Long id, UserUpdateRequest request, AuthUser actor);
    String generateTempPassword();
}
