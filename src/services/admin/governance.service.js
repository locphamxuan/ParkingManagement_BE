/**
 * Ma trận trách nhiệm chuẩn dùng chung cho mọi giao diện.
 */
const getRoleCatalog = () => ({
  operatingModel: {
    admin: 'Chủ hệ thống hoặc đơn vị mua và quản trị PBMS.',
    manager: 'Người vận hành các bãi đỗ xe được Admin phân công.',
    staff: 'Nhân viên bảo vệ/cổng làm việc theo ca được giao.',
    user: 'Khách hàng sử dụng dịch vụ gửi xe.',
  },
  roles: [
    {
      role: 'admin',
      purpose: 'Sở hữu, quản trị và giám sát toàn bộ nền tảng PBMS.',
      capabilities: [
        'Tạo, kích hoạt, tạm dừng và ngừng vận hành bãi xe',
        'Quản lý tài khoản và phân công Manager/Staff cho từng bãi',
        'Xem doanh thu gộp, hoàn tiền, doanh thu thuần và tiền mặt chờ xác nhận',
        'Tra cứu toàn bộ Payment và các bất thường cần đối soát',
        'Kiểm tra audit log, sự kiện bảo mật và sức khỏe vận hành',
        'Xem cấu hình của tất cả bãi trong toàn hệ thống',
      ],
      boundaries: [
        'Không trực tiếp check-in/check-out tại cổng',
        'Không xác nhận tiền mặt thay Manager của bãi',
        'Không thay đổi cấu hình vận hành hằng ngày qua quyền Manager',
      ],
    },
    {
      role: 'manager',
      purpose: 'Vận hành và chịu trách nhiệm tài chính các bãi được phân công.',
      capabilities: [
        'Cấu hình tầng, zone, slot, cổng, bảng giá, gói và chính sách',
        'Xếp ca cho Staff và theo dõi xe đang gửi',
        'Xác nhận tiền mặt do Staff bàn giao',
        'Theo dõi ví bãi, doanh thu, hoàn tiền, phí phạt và sự cố',
      ],
      boundaries: [
        'Chỉ truy cập các bãi được Admin phân công',
        'Không tạo Admin hoặc quản trị bãi của Manager khác',
        'Không chỉnh sửa lịch sử audit của hệ thống',
      ],
    },
    {
      role: 'staff',
      purpose: 'Thực hiện nghiệp vụ ra/vào và an ninh tại cổng trong ca làm việc.',
      capabilities: [
        'Check-in và check-out tại cổng được phân công',
        'Thu hoặc ghi nhận phương thức thanh toán của khách',
        'Xem xe đang đỗ và lịch sử ca làm việc của bản thân',
        'Báo cáo và xử lý sự cố trong phạm vi được cấp quyền',
      ],
      boundaries: [
        'Không cấu hình bảng giá, bãi xe hoặc phân công nhân sự',
        'Không tự xác nhận khoản tiền mặt mình đã thu',
        'Không xem dữ liệu tài chính toàn hệ thống',
      ],
    },
    {
      role: 'user',
      purpose: 'Sử dụng dịch vụ và quản lý hoạt động gửi xe cá nhân.',
      capabilities: [
        'Quản lý phương tiện và ví cá nhân',
        'Mua gói dài hạn và đặt chỗ',
        'Xem lịch sử gửi xe, thanh toán, hoàn tiền và thông báo',
        'Gửi đánh giá và báo cáo sự cố',
      ],
      boundaries: [
        'Chỉ truy cập dữ liệu của chính mình',
        'Không truy cập nghiệp vụ nội bộ hoặc dữ liệu người dùng khác',
      ],
    },
  ],
  separationOfDuties: [
    {
      flow: 'Thu phí gửi xe bằng tiền mặt',
      staff: 'Thu tiền và ghi nhận tại lúc check-out',
      manager: 'Xác nhận đã nhận tiền bàn giao tại bãi',
      admin: 'Giám sát số tiền đang chờ và bất thường toàn hệ thống',
    },
    {
      flow: 'Thanh toán điện tử',
      staff: 'Khởi tạo hoặc kiểm tra thanh toán tại cổng',
      manager: 'Theo dõi tiền vào ví của bãi',
      admin: 'Đối soát giao dịch treo hoặc có trạng thái ngoại lệ',
    },
    {
      flow: 'Hoàn tiền',
      manager: 'Duyệt hoàn tiền nghiệp vụ theo chính sách của bãi',
      admin: 'Kiểm tra tỷ lệ hoàn và ảnh hưởng đến doanh thu thuần',
    },
  ],
});

module.exports = { getRoleCatalog };
