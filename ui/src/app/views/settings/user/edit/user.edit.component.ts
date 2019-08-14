import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';
import { AuthConsumer, AuthDriverManifest, AuthDriverManifests, AuthSession } from 'app/model/authentication.model';
import { Group } from 'app/model/group.model';
import { AuthentifiedUser, UserContact } from 'app/model/user.model';
import { AuthenticationService } from 'app/service/services.module';
import { UserService } from 'app/service/user/user.service';
import { PathItem } from 'app/shared/breadcrumb/breadcrumb.component';
import { Item } from 'app/shared/menu/menu.component';
import { Column, ColumnType, Filter } from 'app/shared/table/data-table.component';
import { ToastService } from 'app/shared/toast/ToastService';
import { AuthenticationState } from 'app/store/authentication.state';
import { forkJoin } from 'rxjs/internal/observable/forkJoin';
import { finalize } from 'rxjs/operators/finalize';
import { ConsumerCreateModalComponent } from '../consumer-create-modal/consumer-create-modal.component';
import { ConsumerDetailsModalComponent } from '../consumer-details-modal/consumer-details-modal.component';

const defaultMenuItems = [<Item>{
    translate: 'user_profile_btn',
    key: 'profile',
    default: true
}, <Item>{
    translate: 'user_groups_btn',
    key: 'groups'
}];

const usernamePattern: RegExp = new RegExp('^[a-zA-Z0-9._-]{1,}$');

@Component({
    selector: 'app-user-edit',
    templateUrl: './user.edit.html',
    styleUrls: ['./user.edit.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserEditComponent implements OnInit {
    @ViewChild('consumerDetailsModal', { static: false })
    consumerDetailsModal: ConsumerDetailsModalComponent;

    @ViewChild('consumerCreateModal', { static: false })
    consumerCreateModal: ConsumerCreateModalComponent;

    loading = false;
    deleteLoading = false;
    groupsAdmin: Array<Group>;
    userPatternError = false;

    username: string;
    currentUser: AuthentifiedUser;
    editable: boolean;
    path: Array<PathItem>;
    menuItems: Array<Item>;
    selectedItem: Item;
    loadingUser: boolean;
    user: AuthentifiedUser;
    columnsGroups: Array<Column<Group>>;
    loadingGroups = false;
    groups: Array<Group>;
    columnsContacts: Array<Column<UserContact>>;
    loadingContacts = false;
    contacts: Array<UserContact>;
    loadingAuthData: boolean;
    drivers: Array<AuthDriverManifest>;
    consumers: Array<AuthConsumer>;
    mConsumers: { [key: string]: AuthConsumer };
    myConsumers: Array<AuthConsumer>;
    selectedConsumer: AuthConsumer;
    columnsConsumers: Array<Column<AuthConsumer>>;
    filterConsumers: Filter<AuthConsumer>;
    columnsSessions: Array<Column<AuthSession>>;
    filterSessions: Filter<AuthSession>;
    sessions: Array<AuthSession>;

    constructor(
        private _authenticationService: AuthenticationService,
        private _userService: UserService,
        private _translate: TranslateService,
        private _route: ActivatedRoute,
        private _router: Router,
        private _store: Store,
        private _toast: ToastService,
        private _cd: ChangeDetectorRef
    ) {
        this.currentUser = this._store.selectSnapshot(AuthenticationState.user);

        this.menuItems = [].concat(defaultMenuItems);

        this.columnsGroups = [
            <Column<Group>>{
                name: 'common_name',
                selector: (g: Group) => g.name
            },
            <Column<Group>>{
                name: 'user_group_role',
                selector: (g: Group) => g.admin ? this._translate.instant('user_group_admin') : this._translate.instant('user_group_member')
            },
        ];

        this.columnsContacts = [
            <Column<UserContact>>{
                name: 'common_name',
                class: 'two',
                selector: (c: UserContact) => c.type
            },
            <Column<UserContact>>{
                type: ColumnType.TEXT_LABELS,
                class: 'fourteen',
                name: 'common_value',
                selector: (c: UserContact) => {
                    let labels = [];

                    if (c.primary) {
                        labels.push({ color: 'green', title: 'user_contact_primary' });
                    }
                    if (!c.verified) {
                        labels.push({ color: 'red', title: 'user_contact_not_verified' });
                    }

                    return {
                        value: c.value,
                        labels
                    }
                }
            }
        ];

        this.filterConsumers = f => {
            const lowerFilter = f.toLowerCase();
            return (c: AuthConsumer) => {
                return c.name.toLowerCase().indexOf(lowerFilter) !== -1 ||
                    c.description.toLowerCase().indexOf(lowerFilter) !== -1 ||
                    c.scopes.join(' ').toLowerCase().indexOf(lowerFilter) !== -1;
            }
        };

        this.columnsConsumers = [
            <Column<AuthConsumer>>{
                name: 'common_name',
                selector: (c: AuthConsumer) => c.name
            },
            <Column<AuthConsumer>>{
                name: 'common_description',
                selector: (c: AuthConsumer) => c.description
            },
            <Column<AuthConsumer>>{
                type: ColumnType.TEXT_ICONS,
                name: 'user_auth_scopes',
                selector: (c: AuthConsumer) => {
                    return {
                        value: c.scopes.join(', '),
                        icons: [
                            {
                                label: 'user_auth_info_scopes',
                                class: ['info', 'circle', 'icon', 'primary', 'link'],
                                title: 'user_auth_info_scopes',
                                trigger: 'outsideClick'
                            }
                        ]
                    }
                }
            },
            <Column<AuthConsumer>>{
                name: 'user_auth_groups',
                selector: (c: AuthConsumer) => c.groups ? c.groups.map((g: Group) => g.name).join(', ') : '*'
            },
            <Column<AuthConsumer>>{
                type: ColumnType.BUTTON,
                name: 'common_action',
                class: 'two right aligned',
                selector: (c: AuthConsumer) => {
                    return {
                        title: 'common_details',
                        click: () => { this.clickConsumerDetails(c) }
                    };
                }
            }
        ];

        this.filterSessions = f => {
            const lowerFilter = f.toLowerCase();
            return (s: AuthSession) => {
                return s.consumer.name.toLowerCase().indexOf(lowerFilter) !== -1 ||
                    s.consumer_id.toLowerCase().indexOf(lowerFilter) !== -1 ||
                    s.created.toLowerCase().indexOf(lowerFilter) !== -1 ||
                    s.expire_at.toLowerCase().indexOf(lowerFilter) !== -1;
            }
        };

        this.columnsSessions = [
            <Column<AuthSession>>{
                name: 'user_auth_consumer',
                selector: (s: AuthSession) => s.consumer.name + ' (' + s.consumer_id + ')'
            },
            <Column<AuthSession>>{
                type: ColumnType.TEXT_LABELS,
                name: 'common_id',
                selector: (s: AuthSession) => {
                    let labels = [];

                    if (s.current) {
                        labels.push({ color: 'blue', title: 'user_auth_session_current' });
                    }

                    return {
                        value: s.id,
                        labels
                    }
                }
            },
            <Column<AuthSession>>{
                type: ColumnType.DATE,
                name: 'common_created',
                selector: (s: AuthSession) => s.created
            },
            <Column<AuthSession>>{
                type: ColumnType.DATE,
                name: 'user_auth_expire_at',
                selector: (s: AuthSession) => s.expire_at
            },
            <Column<AuthSession>>{
                type: ColumnType.CONFIRM_BUTTON,
                name: 'common_action',
                class: 'two right aligned',
                selector: (s: AuthSession) => {
                    return {
                        title: 'user_auth_revoke_btn',
                        color: 'red',
                        click: () => { this.clickSessionRevoke(s) }
                    };
                }
            }
        ];
    }

    ngOnInit() {
        this._route.params.subscribe(params => {
            this.username = params['username'];
            this.getUser();
        });
    }

    clickConsumerDetails(c: AuthConsumer): void {
        this.selectedConsumer = c;
        this.consumerDetailsModal.show();
    }

    clickConsumerSignin(consumerType: string): void {
    }

    clickConsumerDetach(c: AuthConsumer): void {

    }

    clickConsumerCreate(): void {
        this.consumerCreateModal.show();
    }

    clickSessionRevoke(s: AuthSession): void {
        if (s.current) {
            this._authenticationService.signout().subscribe(() => {
                this._router.navigate(['/auth/signin']);
            });
        } else {
            this._userService.deleteSession(this.currentUser.username, s.id).subscribe(() => {
                this.getAuthData();
            });
        }
    }

    clickDelete(): void {
        this.deleteLoading = true;
        this._cd.markForCheck();
        this._userService.delete(this.user.username)
            .pipe(finalize(() => {
                this.deleteLoading = false;
                this._cd.markForCheck();
            }))
            .subscribe(_ => {
                this._toast.success('', this._translate.instant('user_deleted'));
                this._router.navigate(['../'], { relativeTo: this._route });
            });
    }

    clickSave(): void {
        this.userPatternError = false;
        if (!this.user.username || !this.user.fullname) {
            return;
        }
        if (!usernamePattern.test(this.user.username)) {
            this.userPatternError = true;
            this._cd.markForCheck();
            return;
        }

        this.loading = true;
        this._cd.markForCheck();
        this._userService.update(this.username, this.user)
            .pipe(finalize(() => {
                this.loading = false;
                this._cd.markForCheck();
            }))
            .subscribe(u => {
                this._toast.success('', this._translate.instant('user_saved'));
                this.user = u;
                this.setDataFromUser();
                this.updatePath();
                this._router.navigate(['/settings', 'user', this.user.username], { relativeTo: this._route });
            });
    }

    updatePath(): void {
        this.path = [<PathItem>{
            translate: 'common_settings'
        }, <PathItem>{
            translate: 'user_list_title',
            routerLink: ['/', 'settings', 'user']
        }, <PathItem>{
            text: this.user.username,
            routerLink: ['/', 'settings', 'user', this.currentUser.username]
        }];
    }

    selectMenuItem(item: Item): void {
        switch (item.key) {
            case 'groups':
                this.getGroups();
                break;
            case 'contacts':
                this.getContacts();
                break;
            case 'authentication':
                this.getAuthData();
                break;
        }
        this.selectedItem = item;
    }

    getUser(): void {
        this.loadingUser = true;
        this._cd.markForCheck();
        this._userService.get(this.username)
            .pipe(finalize(() => {
                this.loadingUser = false;
                this._cd.markForCheck();
            }))
            .subscribe(u => {
                this.user = u;
                this.setDataFromUser();
                this.updatePath();
            });
    }

    setDataFromUser(): void {
        this.editable = this.user.id === this.currentUser.id || this.currentUser.isAdmin();

        if (this.user.id === this.currentUser.id || this.currentUser.isMaintainer()) {
            this.menuItems = defaultMenuItems.concat([<Item>{
                translate: 'user_contacts_btn',
                key: 'contacts'
            }, <Item>{
                translate: 'user_authentication_btn',
                key: 'authentication'
            }]);
        } else {
            this.menuItems = [].concat(defaultMenuItems);
        }
    }

    getGroups(): void {
        this.loadingGroups = true;
        this._cd.markForCheck();
        this._userService.getGroups(this.user.username)
            .pipe(finalize(() => {
                this.loadingGroups = false;
                this._cd.markForCheck();
            }))
            .subscribe((gs) => {
                this.groups = gs;
            });
    }

    getContacts(): void {
        this.loadingContacts = true;
        this._cd.markForCheck();
        this._userService.getContacts(this.user.username)
            .pipe(finalize(() => {
                this.loadingContacts = false;
                this._cd.markForCheck();
            }))
            .subscribe((cs) => {
                this.contacts = cs;
            });
    }

    getAuthData(): void {
        this.loadingAuthData = true;
        this._cd.markForCheck();
        forkJoin<AuthDriverManifests, Array<AuthConsumer>, Array<AuthSession>>(
            this._authenticationService.getDrivers(),
            this._userService.getConsumers(this.user.username),
            this._userService.getSessions(this.user.username)
        )
            .pipe(finalize(() => {
                this.loadingAuthData = false;
                this._cd.markForCheck();
            }))
            .subscribe(res => {
                this.drivers = res[0].manifests.filter(m => m.type !== 'builtin').sort((a, b) => {
                    if (a.type === 'local') {
                        return -1;
                    }
                    if (b.type === 'local') {
                        return 1;
                    }
                    return a.type < b.type ? -1 : 1;
                });
                this.consumers = res[1];

                this.mConsumers = {};
                this.consumers.forEach((c: AuthConsumer) => {
                    this.mConsumers[c.id] = c;
                    if (c.type !== 'builtin') {
                        this.mConsumers[c.type] = c;
                    }
                });

                this.myConsumers = res[1].filter((c: AuthConsumer) => c.type === 'builtin').map((c: AuthConsumer) => {
                    c.parent = this.mConsumers[c.parent_id];
                    return c;
                });

                this.sessions = res[2].map((s: AuthSession) => {
                    s.consumer = this.mConsumers[s.consumer_id];
                    return s;
                });
            });
    }

    modalClose() {
        this.selectedConsumer = null;
    }
}
